import { info, warn } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import { generateEmbedding } from './embedding.js';

const SIMILARITY_THRESHOLD = 0.6;
const SCAN_LIMIT = 50; // 直近N件をスキャン
const DECAY_HALF_LIFE_DAYS = 7; // 7日で半減

/**
 * コサイン類似度を計算する
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * 時間減衰を計算する
 * time_decay = 1 / (1 + days_elapsed / DECAY_HALF_LIFE_DAYS)
 */
function timeDecay(daysElapsed: number): number {
  return 1 / (1 + daysElapsed / DECAY_HALF_LIFE_DAYS);
}

/**
 * conversation_id が未設定のメッセージに会話グルーピングを適用する
 */
export async function assignConversationIds(): Promise<number> {
  // conversation_id が NULL のメッセージをチャンネルごとに取得
  const { data: ungrouped, error } = await supabase
    .from('messages')
    .select('id, channel_id, content, created_at, reply_to_message_id, embedding')
    .is('conversation_id', null)
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) {
    warn('Failed to fetch ungrouped messages', { error });
    return 0;
  }

  if (!ungrouped || ungrouped.length === 0) return 0;

  let count = 0;
  for (const msg of ungrouped) {
    const conversationId = await determineConversationId(msg);
    const { error: updateError } = await supabase
      .from('messages')
      .update({ conversation_id: conversationId })
      .eq('id', msg.id);

    if (updateError) {
      warn('Failed to update conversation_id', {
        id: msg.id,
        error: updateError,
      });
    } else {
      count++;
    }
  }

  info('Assigned conversation IDs', { count, total: ungrouped.length });
  return count;
}

/**
 * メッセージの conversation_id を決定する
 */
async function determineConversationId(msg: {
  id: number;
  channel_id: number;
  content: string;
  created_at: string;
  reply_to_message_id: number | null;
  embedding: number[] | null;
}): Promise<number> {
  // 1. reply_to_message_id がある場合、返信先の conversation_id を引き継ぐ
  if (msg.reply_to_message_id) {
    const { data: replyTarget } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('id', msg.reply_to_message_id)
      .single();

    if (replyTarget?.conversation_id) {
      return replyTarget.conversation_id;
    }
  }

  // 2. 同チャンネルの直近N件と embedding 類似度を比較
  if (msg.embedding && msg.embedding.length > 0) {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, created_at, embedding, conversation_id')
      .eq('channel_id', msg.channel_id)
      .not('conversation_id', 'is', null)
      .not('embedding', 'is', null)
      .lt('created_at', msg.created_at)
      .order('created_at', { ascending: false })
      .limit(SCAN_LIMIT);

    if (recentMessages && recentMessages.length > 0) {
      let bestScore = 0;
      let bestConversationId: number | null = null;

      const msgDate = new Date(msg.created_at);

      for (const recent of recentMessages) {
        if (!recent.embedding || !recent.conversation_id) continue;

        const similarity = cosineSimilarity(msg.embedding, recent.embedding);
        const recentDate = new Date(recent.created_at);
        const daysElapsed =
          (msgDate.getTime() - recentDate.getTime()) / (1000 * 60 * 60 * 24);
        const decay = timeDecay(daysElapsed);
        const adjustedSimilarity = similarity * decay;

        if (adjustedSimilarity > bestScore) {
          bestScore = adjustedSimilarity;
          bestConversationId = recent.conversation_id;
        }
      }

      if (bestScore > SIMILARITY_THRESHOLD && bestConversationId !== null) {
        return bestConversationId;
      }
    }
  }

  // 3. 新しい conversation_id を発行（メッセージの id をそのまま使う）
  return msg.id;
}
