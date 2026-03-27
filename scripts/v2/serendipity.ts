import { generateEmbedding } from './embedding.js';
import { info, warn } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import { SerendipityResult } from './types.js';

/**
 * MVP の gm 投稿から過去の関連エピソードを検索する
 */
export async function searchSerendipity(
  gmContent: string,
  todayDateStr: string,
  limit: number = 5,
): Promise<SerendipityResult[]> {
  if (!gmContent || gmContent.trim().length === 0) return [];

  try {
    const queryEmbedding = await generateEmbedding(gmContent);

    // RPC を使ってベクトル検索
    const { data, error } = await supabase.rpc('match_messages', {
      query_embedding: JSON.stringify(queryEmbedding),
      exclude_date: todayDateStr,
      match_count: limit,
    });

    if (error) {
      warn('match_messages RPC failed, falling back', { error });
      return await fallbackSearch(queryEmbedding, todayDateStr, limit);
    }

    if (!data || data.length === 0) return [];

    const results: SerendipityResult[] = data.map(
      (row: {
        channel_name: string;
        author_name: string;
        content: string;
        created_at: string;
        similarity: number;
      }) => ({
        channelName: row.channel_name,
        authorName: row.author_name,
        content: row.content,
        createdAt: row.created_at,
        similarityScore: row.similarity,
      }),
    );

    info('Serendipity search results', { count: results.length });
    return results;
  } catch (error) {
    warn('Serendipity search failed', { error });
    return [];
  }
}

/**
 * RPC が使えない場合のフォールバック（アプリ側でコサイン類似度計算）
 */
async function fallbackSearch(
  queryEmbedding: number[],
  todayDateStr: string,
  limit: number,
): Promise<SerendipityResult[]> {
  // 直近のメッセージから embedding 付きを取得して手動比較
  const { data, error } = await supabase
    .from('messages')
    .select('id, channel_id, author_name, content, created_at, embedding')
    .not('embedding', 'is', null)
    .lt('created_at', todayDateStr)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  // チャンネル名を取得
  const channelIds = [...new Set(data.map((m) => m.channel_id))];
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', channelIds);

  const channelMap = new Map(
    (channels || []).map((c) => [c.id, c.name]),
  );

  // コサイン類似度を計算してソート
  const scored = data
    .filter((m) => m.embedding && m.embedding.length > 0)
    .map((m) => ({
      channelName: channelMap.get(m.channel_id) || String(m.channel_id),
      authorName: m.author_name,
      content: m.content,
      createdAt: m.created_at,
      similarityScore: cosineSimilarity(queryEmbedding, m.embedding),
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);

  return scored;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
