/**
 * 全チャンネル一括 migration スクリプト
 *
 * 1. 全パブリックチャンネル取得 → DB 同期
 * 2. 各チャンネルの全メッセージ取得（古い順）→ DB 保存
 * 3. Embedding 生成（リトライ付き）
 * 4. 会話グルーピング
 * 5. メモリ抽出（月単位バッチ）
 *
 * 使い方:
 *   npx tsx scripts/migration/full-migration.ts
 *
 * 冪等: 何度実行しても安全（upsert / NULL のみ処理）
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { supabase } from '../v2/supabase-client.js';
import {
  fetchPublicTextChannels,
  syncChannels,
} from '../v2/channel-fetcher.js';
import { generateAndStoreMessageEmbeddings } from '../v2/embedding.js';
import { assignConversationIds } from '../v2/conversation.js';
import { extractAndStoreMemories } from '../v2/memory-extractor.js';
import { syncCommunityFacts } from '../v2/community-facts.js';
import { error as logError } from '../utils/logger.js';
import { DiscordMessage } from '../types/discord.js';

const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;
const EXCLUDE_CHANNEL_IDS = (process.env.EXCLUDE_CHANNEL_IDS || '')
  .split(',')
  .filter(Boolean);

const DISCORD_API_BASE = 'https://discord.com/api/v10';

interface DiscordMessageWithRef extends DiscordMessage {
  message_reference?: {
    message_id?: string;
    channel_id?: string;
    guild_id?: string;
  };
}

async function main() {
  const startTime = Date.now();
  console.log('=== Full Migration Start ===\n');

  // ----------------------------------------
  // Step 1: 全チャンネル取得 → DB 同期
  // ----------------------------------------
  console.log('Step 1: チャンネル取得 → DB 同期...');
  const channels = await fetchPublicTextChannels(
    GUILD_ID,
    TOKEN,
    EXCLUDE_CHANNEL_IDS,
  );
  await syncChannels(channels);
  console.log(`  → ${channels.length}チャンネルを同期\n`);

  // ----------------------------------------
  // Step 2: 各チャンネルの全メッセージ取得 → DB 保存
  // ----------------------------------------
  console.log('Step 2: 全チャンネルのメッセージ取得...');
  let totalMessages = 0;

  for (const ch of channels) {
    process.stdout.write(`  ${ch.name}...`);

    // 既に DB にあるメッセージ数を確認（冪等のため）
    const { count: existingCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', Number(ch.id));

    const messages = await fetchAllMessages(ch.id);

    if (messages.length === 0) {
      console.log(' 0件（スキップ）');
      continue;
    }

    // 古い順にソート
    messages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // DB に INSERT（バッチ）
    const batchSize = 500;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const rows = batch.map((msg) => ({
        id: Number(msg.id),
        channel_id: Number(msg.channel_id),
        author_id: Number(msg.author.id),
        author_name: msg.author.global_name || msg.author.username,
        content: sanitizeContent(msg.content || ''),
        created_at: msg.timestamp,
        reaction_count: msg.reactions
          ? msg.reactions.reduce((sum, r) => sum + r.count, 0)
          : 0,
        reply_to_message_id: getReplyToMessageId(
          msg as DiscordMessageWithRef,
        ),
        fetched_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('messages')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

      if (error) {
        console.error(`\n  INSERT エラー (${ch.name}, batch ${i}):`, error.message);
      }
    }

    // last_fetched_message_id を更新（日次差分取得の起点）
    const latestMsg = messages.reduce((a, b) =>
      BigInt(a.id) > BigInt(b.id) ? a : b,
    );
    const { error: updateError } = await supabase
      .from('channels')
      .update({
        last_fetched_message_id: Number(latestMsg.id),
        updated_at: new Date().toISOString(),
      })
      .eq('id', Number(ch.id));

    if (updateError) {
      console.error(`  last_fetched_message_id 更新エラー (${ch.name}):`, updateError.message);
    }

    const newCount = messages.length - (existingCount || 0);
    totalMessages += messages.length;
    console.log(
      ` ${messages.length}件${newCount > 0 && existingCount ? `（新規 ${newCount}）` : ''}`,
    );
  }
  console.log(`  → 合計 ${totalMessages}件を DB に保存\n`);

  // ----------------------------------------
  // Step 3: Embedding 生成
  // ----------------------------------------
  console.log('Step 3: Embedding 生成...');
  let totalEmbeddings = 0;
  while (true) {
    const count = await generateAndStoreMessageEmbeddings();
    if (count === 0) break;
    totalEmbeddings += count;
    process.stdout.write(`\r  → ${totalEmbeddings}件 embedding 済み...`);
  }
  console.log(`\n  → 合計 ${totalEmbeddings}件\n`);

  // ----------------------------------------
  // Step 4: 会話グルーピング
  // ----------------------------------------
  console.log('Step 4: 会話グルーピング...');
  let totalConv = 0;
  while (true) {
    const count = await assignConversationIds();
    if (count === 0) break;
    totalConv += count;
    process.stdout.write(`\r  → ${totalConv}件 グルーピング済み...`);
  }
  console.log(`\n  → 合計 ${totalConv}件\n`);

  // ----------------------------------------
  // Step 5: メモリ抽出（チャンネル×月単位）
  // ----------------------------------------
  console.log('Step 5: メモリ抽出（チャンネル×月単位）...');

  // 既存メモリをクリア（pinned は保持）
  await supabase.from('memories').delete().gte('id', 0).eq('pinned', false);

  const months = await getMonthRanges();
  let totalMemories = 0;

  for (const ch of channels) {
    let chMemories = 0;
    for (const { label, start, end } of months) {
      const count = await extractAndStoreMemories(
        start,
        GUILD_ID,
        end,
        Number(ch.id),
      );
      chMemories += count;
    }
    if (chMemories > 0) {
      console.log(`  ${ch.name}: ${chMemories}件`);
    }
    totalMemories += chMemories;
  }
  console.log(`  → 合計 ${totalMemories}件のメモリを抽出\n`);

  // ----------------------------------------
  // Step 6: community-facts.json → DB 同期
  // ----------------------------------------
  console.log('Step 6: community-facts.json 同期...');
  const factsCount = await syncCommunityFacts();
  console.log(`  → ${factsCount}件の手動メモリを同期\n`);

  // ----------------------------------------
  // 結果確認
  // ----------------------------------------
  await printResults();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  console.log(`\n実行時間: ${minutes}分${seconds}秒`);
  console.log('\n=== Full Migration Complete ===');
}

/**
 * チャンネルの全メッセージを before パラメータで最古まで遡って取得
 */
async function fetchAllMessages(
  channelId: string,
): Promise<DiscordMessage[]> {
  const all: DiscordMessage[] = [];
  let before: string | null = null;

  while (true) {
    const url = new URL(
      `${DISCORD_API_BASE}/channels/${channelId}/messages`,
    );
    url.searchParams.set('limit', '100');
    if (before) url.searchParams.set('before', before);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bot ${TOKEN}`,
        'User-Agent': 'Discord-GM-Counter/2.0',
      },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '2');
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) break;

    const msgs = (await res.json()) as DiscordMessage[];
    if (msgs.length === 0) break;

    all.push(...msgs);
    before = msgs[msgs.length - 1].id;

    if (msgs.length < 100) break;
  }

  return all;
}

/**
 * 不正な Unicode エスケープシーケンスを除去する
 */
function sanitizeContent(content: string): string {
  // eslint-disable-next-line no-control-regex
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function getReplyToMessageId(msg: DiscordMessageWithRef): number | null {
  const ref = msg.message_reference;
  if (ref?.message_id) {
    return Number(ref.message_id);
  }
  return null;
}

/**
 * DB 内の全メッセージの日付範囲から月単位のレンジを生成
 */
async function getMonthRanges(): Promise<
  { label: string; start: string; end: string }[]
> {
  const { data: firstRow } = await supabase
    .from('messages')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  const { data: lastRow } = await supabase
    .from('messages')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!firstRow?.[0] || !lastRow?.[0]) return [];

  const first = new Date(firstRow[0].created_at);
  const last = new Date(lastRow[0].created_at);
  const current = new Date(first.getFullYear(), first.getMonth(), 1);

  const ranges: { label: string; start: string; end: string }[] = [];

  while (current <= last) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 1).toISOString();
    const label = `${year}/${String(month + 1).padStart(2, '0')}`;

    ranges.push({ label, start, end });
    current.setMonth(current.getMonth() + 1);
  }

  return ranges;
}

async function printResults() {
  console.log('=== 結果確認 ===\n');

  const { count: msgCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true });

  const { count: embCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  const { data: convIds } = await supabase
    .from('messages')
    .select('conversation_id')
    .not('conversation_id', 'is', null);
  const uniqueConvs = new Set(
    (convIds || []).map((r) => r.conversation_id),
  );

  const { data: channelCounts } = await supabase
    .from('channels')
    .select('id, name');

  console.log(`messages: ${msgCount}件`);
  console.log(`  embedding: ${embCount}件`);
  console.log(`  会話数: ${uniqueConvs.size}`);
  console.log(`channels: ${(channelCounts || []).length}件`);

  const { data: memoryRows, count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact' });
  console.log(`memories: ${memCount}件`);

  if (memoryRows && memoryRows.length > 0) {
    const scopes = { user: 0, channel: 0, server: 0 };
    for (const m of memoryRows) {
      scopes[m.scope as keyof typeof scopes]++;
    }
    console.log(
      `  user: ${scopes.user}, channel: ${scopes.channel}, server: ${scopes.server}`,
    );
  }
}

main().catch((err) => {
  logError('Full migration failed', err);
  process.exit(1);
});
