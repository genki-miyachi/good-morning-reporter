/**
 * full-migration 後の補完スクリプト
 *
 * 1. 残りの embedding 生成（空コンテンツ除外済み）
 * 2. 残りの会話グルーピング
 * 3. メモリ再抽出（チャンネル×月単位、pinned 保持）
 * 4. community-facts.json → DB 同期
 * 5. last_fetched_message_id 修正
 *
 * 使い方:
 *   npx tsx scripts/migration/post-migration.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { supabase } from '../v2/supabase-client.js';
import { generateAndStoreMessageEmbeddings } from '../v2/embedding.js';
import { assignConversationIds } from '../v2/conversation.js';
import { extractAndStoreMemories } from '../v2/memory-extractor.js';
import { syncCommunityFacts } from '../v2/community-facts.js';
import { error as logError } from '../utils/logger.js';

const GUILD_ID = process.env.GUILD_ID!;

async function main() {
  const startTime = Date.now();
  console.log('=== Post Migration Start ===\n');

  // ----------------------------------------
  // Step 1: 残りの Embedding 生成
  // ----------------------------------------
  console.log('Step 1: 残りの Embedding 生成...');
  let totalEmbeddings = 0;
  while (true) {
    const count = await generateAndStoreMessageEmbeddings();
    if (count === 0) break;
    totalEmbeddings += count;
    process.stdout.write(`\r  → ${totalEmbeddings}件 embedding 済み...`);
  }
  console.log(`\n  → 合計 ${totalEmbeddings}件\n`);

  // ----------------------------------------
  // Step 2: 残りの会話グルーピング
  // ----------------------------------------
  console.log('Step 2: 残りの会話グルーピング...');
  let totalConv = 0;
  while (true) {
    const count = await assignConversationIds();
    if (count === 0) break;
    totalConv += count;
    process.stdout.write(`\r  → ${totalConv}件 グルーピング済み...`);
  }
  console.log(`\n  → 合計 ${totalConv}件\n`);

  // ----------------------------------------
  // Step 3: メモリ再抽出（チャンネル×月単位、pinned 保持）
  // ----------------------------------------
  console.log('Step 3: メモリ再抽出（チャンネル×月、pinned 保持）...');
  await supabase.from('memories').delete().gte('id', 0).eq('pinned', false);

  const { data: channels } = await supabase
    .from('channels')
    .select('id, name');

  if (!channels || channels.length === 0) {
    console.log('  チャンネルなし、スキップ\n');
  } else {
    const months = await getMonthRanges();
    let totalMemories = 0;

    for (const ch of channels) {
      let chMemories = 0;
      for (const { start, end } of months) {
        const count = await extractAndStoreMemories(
          start,
          GUILD_ID,
          end,
          ch.id,
        );
        chMemories += count;
      }
      if (chMemories > 0) {
        console.log(`  ${ch.name}: ${chMemories}件`);
      }
      totalMemories += chMemories;
    }
    console.log(`  → 合計 ${totalMemories}件のメモリを抽出\n`);
  }

  // ----------------------------------------
  // Step 4: community-facts.json → DB 同期
  // ----------------------------------------
  console.log('Step 4: community-facts.json 同期...');
  const factsCount = await syncCommunityFacts();
  console.log(`  → ${factsCount}件の手動メモリを同期\n`);

  // ----------------------------------------
  // Step 5: last_fetched_message_id 修正
  // ----------------------------------------
  console.log('Step 5: last_fetched_message_id 修正...');
  let updatedChannels = 0;

  for (const ch of channels || []) {
    const { data: latest } = await supabase
      .from('messages')
      .select('id')
      .eq('channel_id', ch.id)
      .order('id', { ascending: false })
      .limit(1);

    if (!latest || latest.length === 0) continue;

    const { error } = await supabase
      .from('channels')
      .update({
        last_fetched_message_id: latest[0].id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ch.id);

    if (!error) updatedChannels++;
  }
  console.log(`  → ${updatedChannels}チャンネルを更新\n`);

  // ----------------------------------------
  // 結果確認
  // ----------------------------------------
  await printResults();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  console.log(`\n実行時間: ${minutes}分${seconds}秒`);
  console.log('\n=== Post Migration Complete ===');
}

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

  const { count: memCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true });

  const { count: pinnedCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('pinned', true);

  const { count: lastFetchedCount } = await supabase
    .from('channels')
    .select('*', { count: 'exact', head: true })
    .not('last_fetched_message_id', 'is', null);

  console.log(`messages: ${msgCount}件`);
  console.log(`  embedding: ${embCount}件`);
  console.log(`  会話数: ${uniqueConvs.size}`);
  console.log(`memories: ${memCount}件 (pinned: ${pinnedCount}件)`);
  console.log(`channels: last_fetched_message_id 設定済み ${lastFetchedCount}件`);
}

main().catch((err) => {
  logError('Post migration failed', err);
  process.exit(1);
});
