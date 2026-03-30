/**
 * Daily count v2 - メインエントリーポイント
 *
 * Phase 1: データ収集（チャンネル取得 → メッセージ取得 → DB保存）
 * Phase 2: エンリッチメント（embedding → 会話グルーピング → メモリ抽出）
 * Phase 3: メッセージ生成（MVP選出 → アクティビティ → セレンディピティ → プロンプト構築）
 * Phase 4: 投稿
 */

import { config as dotenvConfig } from 'dotenv';
import { fetchMessages, postResult } from './discord-client.js';
import { generateMessage } from './gemini-client.js';
import { info, error as logError } from './utils/logger.js';
import { getStartOfDayUTC, formatDateString } from './utils/timezone.js';
import { snowflakeToTimestampMs } from './utils/snowflake.js';
import {
  fetchPublicTextChannels,
  syncChannels,
} from './v2/channel-fetcher.js';
import { fetchAndStoreMessages } from './v2/message-store.js';
import { generateAndStoreMessageEmbeddings } from './v2/embedding.js';
import { assignConversationIds } from './v2/conversation.js';
import {
  extractAndStoreMemories,
  decayOngoingMemories,
} from './v2/memory-extractor.js';
import { selectMemories } from './v2/memory-selector.js';
import { searchSerendipity } from './v2/serendipity.js';
import { fetchTodayActivities } from './v2/activity-fetcher.js';
import { buildPromptV2, GmMessageContext } from './v2/prompt-v2.js';
import { supabase } from './v2/supabase-client.js';
import { DiscordMessage } from './types/discord.js';

dotenvConfig();

const TIMEZONE = process.env.TIMEZONE || 'Asia/Tokyo';

async function main(): Promise<void> {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.CHANNEL_ID; // gm チャンネル
    const guildId = process.env.GUILD_ID;
    const dryRun = !!process.env.DRY_RUN;

    if (!token || !channelId || !guildId) {
      throw new Error(
        'DISCORD_BOT_TOKEN, CHANNEL_ID, GUILD_ID are required',
      );
    }

    const excludeChannelIds = (process.env.EXCLUDE_CHANNEL_IDS || '')
      .split(',')
      .filter(Boolean);

    const now = new Date();
    const startOfDay = getStartOfDayUTC(now, TIMEZONE);
    const todayDateStr = formatDateString(startOfDay, TIMEZONE);
    const todayStart = startOfDay.toISOString();
    // YYYY-MM-DD 形式（セレンディピティ検索の exclude_date 用）
    const todayDateOnly = startOfDay.toISOString().split('T')[0];

    info('Starting daily count v2', { dateStr: todayDateStr, dryRun });

    // ========================================
    // Phase 1: データ収集
    // ========================================

    // 全パブリックチャンネルを取得して DB 同期
    const channels = await fetchPublicTextChannels(
      guildId,
      token,
      excludeChannelIds,
    );
    await syncChannels(channels);

    // 差分メッセージ取得 → DB 保存
    await fetchAndStoreMessages(channels, token);

    // ========================================
    // Phase 2: エンリッチメント
    // ========================================

    // embedding 生成
    await generateAndStoreMessageEmbeddings();

    // 会話グルーピング
    await assignConversationIds();

    // メモリ抽出（ongoing 減衰含む）
    await extractAndStoreMemories(todayStart, guildId);
    await decayOngoingMemories();

    // ========================================
    // Phase 3: メッセージ生成
    // ========================================

    // gm チャンネルの当日投稿を取得
    const gmMessages = await fetchGmMessages(channelId, todayStart);
    const uniqueAuthors = [
      ...new Set(gmMessages.map((m) => m.author.id)),
    ];
    const count = uniqueAuthors.length;

    info('GM channel stats', {
      count,
      totalMessages: gmMessages.length,
    });

    // gm メッセージのコンテキスト作成
    const gmMessageContexts: GmMessageContext[] = gmMessages.map((msg) => ({
      userName: msg.author.username,
      userId: msg.author.id,
      userGlobalName: msg.author.global_name || msg.author.username,
      messageContent: msg.content || '',
      reactionCount: msg.reactions
        ? msg.reactions.reduce((sum, r) => sum + r.count, 0)
        : 0,
      wakeupTime: formatTimestampJst(msg.timestamp),
    }));

    // 直近3日間の MVP 情報を取得
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const { data: recentBotPosts } = await supabase
      .from('bot_posts')
      .select('*')
      .gte('posted_at', threeDaysAgo.toISOString())
      .order('posted_at', { ascending: false });

    const recentMvpUserIds = (recentBotPosts || [])
      .filter((p) => p.mvp_user_id)
      .map((p) => String(p.mvp_user_id));

    // MVP 候補 = gm に投稿したユーザー（gm のみ除外はプロンプト側で処理）
    const mvpCandidateIds = uniqueAuthors;

    // 今日のアクティブチャンネル ID
    const { data: activeChannelRows } = await supabase
      .from('messages')
      .select('channel_id')
      .gte('created_at', todayStart)
      .neq('channel_id', Number(channelId));

    const todayActiveChannelIds = [
      ...new Set(
        (activeChannelRows || []).map((r) => String(r.channel_id)),
      ),
    ];

    // 当日アクティビティ取得
    const todayActivities = await fetchTodayActivities(
      mvpCandidateIds,
      todayStart,
      channelId,
    );

    // セレンディピティ検索（MVP の gm 投稿で検索）
    const gmContentForSearch = gmMessages
      .map((m) => m.content)
      .filter((c) => c && c.trim().length > 0)
      .join(' ');
    const serendipityResults = await searchSerendipity(
      gmContentForSearch,
      todayDateOnly,
    );

    // メモリ選択（3層フィルタ）
    const mvpUserId = mvpCandidateIds[0] || ''; // 暫定、プロンプト側で最終決定
    const { serverMemories, channelMemories, userMemories } =
      await selectMemories(
        gmContentForSearch,
        mvpUserId,
        mvpCandidateIds,
        todayActiveChannelIds,
      );

    // ユーザー名をセット
    for (const um of userMemories) {
      const gmMsg = gmMessages.find((m) => m.author.id === um.userId);
      if (gmMsg) {
        um.userName =
          gmMsg.author.global_name || gmMsg.author.username;
      }
    }

    // プロンプト構築
    const prompt = await buildPromptV2({
      dateStr: todayDateStr,
      count,
      totalMessages: gmMessages.length,
      gmMessages: gmMessageContexts,
      todayActivities,
      serendipityResults,
      serverMemories,
      channelMemories,
      userMemories,
      recentMvpUserIds,
      recentBotPosts: recentBotPosts || [],
    });

    // Gemini でメッセージ生成
    const resultMessage = await generateMessage(prompt, {
      timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 30000,
    });

    info('Generated message', {
      length: resultMessage.length,
    });

    // ========================================
    // Phase 4: 投稿
    // ========================================

    if (dryRun) {
      info('DRY_RUN mode: Would post the following message');
      console.log('---');
      console.log(resultMessage);
      console.log('---');
      console.log('Prompt length:', prompt.length);
    } else {
      await postResult(channelId, resultMessage, token);
      info('Result posted successfully');

      // bot_posts に記録
      const mentionMatch = resultMessage.match(/<@(\d+)>/);
      const mvpUserIdFromMessage = mentionMatch
        ? mentionMatch[1]
        : null;

      const { error: insertError } = await supabase
        .from('bot_posts')
        .insert({
          channel_id: Number(channelId),
          content: resultMessage,
          mvp_user_id: mvpUserIdFromMessage
            ? Number(mvpUserIdFromMessage)
            : null,
          posted_at: new Date().toISOString(),
          date_label: todayDateStr,
        });

      if (insertError) {
        logError('Failed to record bot post', insertError);
      }
    }
  } catch (err) {
    logError('Error in daily-count-v2', err);
    process.exit(1);
  }
}

/**
 * gm チャンネルの当日投稿を DB から取得
 */
async function fetchGmMessages(
  channelId: string,
  todayStart: string,
): Promise<DiscordMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id::text, channel_id::text, author_id::text, author_name, content, created_at, reaction_count')
    .eq('channel_id', channelId)
    .gte('created_at', todayStart)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  // DiscordMessage 形式に変換
  return data.map((row) => ({
    id: row.id,
    channel_id: row.channel_id,
    content: row.content,
    timestamp: row.created_at,
    edited_timestamp: null,
    author: {
      id: row.author_id,
      username: row.author_name,
      global_name: row.author_name,
      bot: false,
    },
    reactions: row.reaction_count > 0
      ? [{ emoji: { name: '👍' }, count: row.reaction_count }]
      : undefined,
    attachments: [],
    embeds: [],
  }));
}

/**
 * タイムスタンプを JST 形式にフォーマット
 */
function formatTimestampJst(timestamp: string): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}+09:00`;
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]);

if (isMainModule) {
  main();
}
