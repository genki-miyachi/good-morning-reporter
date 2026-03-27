import { generateEmbedding } from './embedding.js';
import { info } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import {
  UserMemoryContext,
  ChannelMemoryContext,
  ServerMemoryContext,
} from './types.js';

/** カテゴリごとの固定重み */
const CATEGORY_WEIGHTS: Record<string, number> = {
  ongoing: 1.0,
  interest: 0.8,
  personality: 0.7,
  habit: 0.6,
  skill: 0.5,
  relationship: 0.4,
  topic: 0.7,
  slang: 0.8,
};

/** トークン予算（文字数上限） */
const TOKEN_BUDGETS = {
  server: 500,
  channel: 500,
  mvpUser: 800,
  otherUser: 400,
};

interface ScoredMemory {
  id: number;
  scope: string;
  scope_id: number;
  category: string;
  key: string;
  value: string;
  confidence: number;
  updated_at: string;
  similarity: number;
  compositeScore: number;
}

/**
 * 3層フィルタでメモリを選択する
 */
export async function selectMemories(
  gmContent: string,
  mvpUserId: string,
  todayGmAuthorIds: string[],
  todayActiveChannelIds: string[],
): Promise<{
  serverMemories: ServerMemoryContext[];
  channelMemories: ChannelMemoryContext[];
  userMemories: UserMemoryContext[];
}> {
  // クエリ用の embedding を生成
  const queryEmbedding = await generateEmbedding(gmContent);

  // Layer 1: SQL プリフィルタ（並行実行）
  const [serverResult, channelResult, userResult] = await Promise.all([
    fetchServerMemories(),
    fetchChannelMemories(todayActiveChannelIds),
    fetchUserMemories(todayGmAuthorIds, queryEmbedding),
  ]);

  // チャンネル名を取得
  const channelIds = [
    ...new Set(channelResult.map((m) => m.scope_id)),
  ];
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', channelIds.length > 0 ? channelIds : [0]);

  const channelMap = new Map(
    (channels || []).map((c) => [c.id, c.name]),
  );

  // Layer 2 & 3: スコアリング + トークン予算

  // サーバーメモリ（件数少ないので基本全件）
  const serverMemories = applyTokenBudget(
    serverResult.map((m) => ({ key: m.key, value: m.value })),
    TOKEN_BUDGETS.server,
  ).map((m) => ({ key: m.key, value: m.value }));

  // チャンネルメモリ
  const channelMemoriesGrouped = groupByChannel(
    channelResult,
    channelMap,
    TOKEN_BUDGETS.channel,
  );

  // ユーザーメモリ（Layer 2: スコアリング）
  const scoredUserMemories = scoreMemories(userResult, queryEmbedding);
  const userMemories = groupByUser(
    scoredUserMemories,
    mvpUserId,
    TOKEN_BUDGETS.mvpUser,
    TOKEN_BUDGETS.otherUser,
  );

  info('Selected memories', {
    server: serverMemories.length,
    channels: channelMemoriesGrouped.length,
    users: userMemories.length,
  });

  return {
    serverMemories,
    channelMemories: channelMemoriesGrouped,
    userMemories,
  };
}

/**
 * Layer 1: サーバーメモリ取得
 */
async function fetchServerMemories() {
  const { data, error } = await supabase
    .from('memories')
    .select('id, scope, scope_id, category, key, value, confidence, updated_at')
    .eq('scope', 'server')
    .gte('confidence', 0.5);

  if (error) return [];
  return data || [];
}

/**
 * Layer 1: チャンネルメモリ取得
 */
async function fetchChannelMemories(channelIds: string[]) {
  if (channelIds.length === 0) return [];

  const { data, error } = await supabase
    .from('memories')
    .select('id, scope, scope_id, category, key, value, confidence, updated_at')
    .eq('scope', 'channel')
    .in('scope_id', channelIds.map(Number))
    .gte('confidence', 0.5);

  if (error) return [];
  return data || [];
}

/**
 * Layer 1: ユーザーメモリ取得（match_memories RPC を試み、フォールバックあり）
 */
async function fetchUserMemories(
  userIds: string[],
  queryEmbedding: number[],
) {
  if (userIds.length === 0) return [];

  // まず RPC を試みる
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'match_memories',
    {
      query_embedding: JSON.stringify(queryEmbedding),
      scope_filter: 'user',
      scope_ids: userIds.map(Number),
      min_confidence: 0.5,
      match_count: 50,
    },
  );

  if (!rpcError && rpcData) {
    return rpcData;
  }

  // フォールバック: 通常の SELECT
  const { data, error } = await supabase
    .from('memories')
    .select('id, scope, scope_id, category, key, value, confidence, updated_at')
    .eq('scope', 'user')
    .in('scope_id', userIds.map(Number))
    .gte('confidence', 0.5)
    .limit(100);

  if (error) return [];
  return (data || []).map((m) => ({ ...m, similarity: 0.5 }));
}

/**
 * Layer 2: 複合スコアリング
 */
function scoreMemories(
  memories: Array<{
    id: number;
    scope: string;
    scope_id: number;
    category: string;
    key: string;
    value: string;
    confidence: number;
    updated_at: string;
    similarity: number;
  }>,
  _queryEmbedding: number[],
): ScoredMemory[] {
  const now = Date.now();

  return memories
    .map((m) => {
      const relevance = m.similarity || 0;
      const confidence = m.confidence || 0;
      const daysSinceUpdate =
        (now - new Date(m.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      const freshness = 1 / (1 + daysSinceUpdate / 30);
      const categoryWeight = CATEGORY_WEIGHTS[m.category] ?? 0.5;

      const compositeScore =
        relevance * 0.4 +
        confidence * 0.3 +
        freshness * 0.2 +
        categoryWeight * 0.1;

      return { ...m, compositeScore };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Layer 3: トークン予算で切り捨て
 */
function applyTokenBudget<T extends { key: string; value: string }>(
  items: T[],
  budget: number,
): T[] {
  const result: T[] = [];
  let totalChars = 0;

  for (const item of items) {
    const itemChars = item.key.length + item.value.length + 10;
    if (totalChars + itemChars > budget) break;
    result.push(item);
    totalChars += itemChars;
  }

  return result;
}

/**
 * チャンネルメモリをグルーピングしてトークン予算適用
 */
function groupByChannel(
  memories: Array<{
    scope_id: number;
    key: string;
    value: string;
    confidence: number;
  }>,
  channelMap: Map<number, string>,
  budget: number,
): ChannelMemoryContext[] {
  const grouped = new Map<number, typeof memories>();
  for (const m of memories) {
    const arr = grouped.get(m.scope_id) || [];
    arr.push(m);
    grouped.set(m.scope_id, arr);
  }

  const result: ChannelMemoryContext[] = [];
  let totalChars = 0;

  for (const [channelId, mems] of grouped) {
    const channelName = channelMap.get(channelId) || String(channelId);
    const items = mems.map((m) => ({
      key: m.key,
      value: m.value,
      confidence: m.confidence,
    }));

    const charsNeeded = items.reduce(
      (sum, i) => sum + i.key.length + i.value.length + 10,
      0,
    );

    if (totalChars + charsNeeded > budget) break;

    result.push({
      channelId: String(channelId),
      channelName,
      memories: items,
    });
    totalChars += charsNeeded;
  }

  return result;
}

/**
 * ユーザーメモリをグルーピング（MVP は予算多め）
 */
function groupByUser(
  memories: ScoredMemory[],
  mvpUserId: string,
  mvpBudget: number,
  otherBudget: number,
): UserMemoryContext[] {
  const grouped = new Map<number, ScoredMemory[]>();
  for (const m of memories) {
    const arr = grouped.get(m.scope_id) || [];
    arr.push(m);
    grouped.set(m.scope_id, arr);
  }

  // ユーザー名を取得するために messages テーブルは使わず、
  // メモリのスコアから直接構築
  const result: UserMemoryContext[] = [];

  for (const [userId, mems] of grouped) {
    const isMvp = String(userId) === mvpUserId;
    const budget = isMvp ? mvpBudget : otherBudget;

    const budgeted = applyTokenBudget(mems, budget);

    result.push({
      userId: String(userId),
      userName: '', // 呼び出し側でセットする
      memories: budgeted.map((m) => ({
        category: m.category,
        key: m.key,
        value: m.value,
        confidence: m.confidence,
        score: m.compositeScore,
      })),
    });
  }

  // MVP を先頭にソート
  result.sort((a, b) => {
    if (a.userId === mvpUserId) return -1;
    if (b.userId === mvpUserId) return 1;
    return 0;
  });

  return result;
}
