import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { info, warn } from '../utils/logger.js';
import { supabase } from './supabase-client.js';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 3000;

let _embeddingModel: GenerativeModel | null = null;

function getEmbeddingModel(): GenerativeModel {
  if (!_embeddingModel) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    _embeddingModel = genAI.getGenerativeModel({
      model: 'gemini-embedding-001',
    });
  }
  return _embeddingModel;
}

/**
 * 429 レート制限時にリトライ付きで embedding を生成する（3072次元）
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await getEmbeddingModel().embedContent(text);
      return result.embedding.values;
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 429 && attempt < MAX_RETRIES - 1) {
        const retryDelay = extractRetryDelay(error) || BASE_RETRY_DELAY_MS * (attempt + 1);
        warn('Embedding rate limited, retrying', {
          attempt: attempt + 1,
          waitMs: retryDelay,
        });
        await sleep(retryDelay);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded for embedding generation');
}

/**
 * 複数テキストの embedding を一括生成する
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    try {
      const embedding = await generateEmbedding(text);
      results.push(embedding);
    } catch (error) {
      warn('Failed to generate embedding, using empty', { error });
      results.push([]);
    }
  }
  return results;
}

/**
 * messages テーブルの embedding が NULL のレコードに embedding を生成して保存する
 */
export async function generateAndStoreMessageEmbeddings(): Promise<number> {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content')
    .is('embedding', null)
    .neq('content', '')
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    warn('Failed to fetch messages without embedding', { error });
    return 0;
  }

  if (!messages || messages.length === 0) return 0;

  let count = 0;
  for (const msg of messages) {
    if (!msg.content || msg.content.trim().length === 0) continue;

    try {
      const embedding = await generateEmbedding(msg.content);
      const { error: updateError } = await supabase
        .from('messages')
        .update({ embedding })
        .eq('id', msg.id);

      if (updateError) {
        warn('Failed to update message embedding', {
          id: msg.id,
          error: updateError,
        });
      } else {
        count++;
      }
    } catch (error) {
      warn('Failed to generate embedding for message', {
        id: msg.id,
        error,
      });
    }
  }

  info('Generated message embeddings', { count, total: messages.length });
  return count;
}

/**
 * Gemini API のエラーから retryDelay を抽出する（ミリ秒）
 */
function extractRetryDelay(error: unknown): number | null {
  try {
    const details = (error as { errorDetails?: Array<{ '@type': string; retryDelay?: string }> })
      .errorDetails;
    if (!details) return null;

    const retryInfo = details.find(
      (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
    );
    if (!retryInfo?.retryDelay) return null;

    // "3s" → 3000, "500ms" → 500
    const match = retryInfo.retryDelay.match(/^(\d+)(s|ms)$/);
    if (!match) return null;

    return match[2] === 's'
      ? parseInt(match[1]) * 1000
      : parseInt(match[1]);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
