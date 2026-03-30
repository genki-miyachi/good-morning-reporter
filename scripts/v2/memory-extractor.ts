import { generateMessage } from '../gemini-client.js';
import { generateEmbedding } from './embedding.js';
import { info, warn } from '../utils/logger.js';
import { supabase } from './supabase-client.js';

/** Gemini が返すメモリ抽出結果 */
interface ExtractedMemory {
  scope: 'user' | 'channel' | 'server';
  scopeId: string;
  category: string;
  key: string;
  value: string;
  confidence?: number;
}

/**
 * 指定期間の投稿からメモリを抽出し、memories テーブルに保存する
 *
 * @param periodStart - 期間の開始（ISO 8601）
 * @param guildId - Discord Guild ID
 * @param periodEnd - 期間の終了（ISO 8601）。省略時は periodStart の翌日
 */
export async function extractAndStoreMemories(
  periodStart: string,
  guildId: string,
  periodEnd?: string,
  channelId?: number,
): Promise<number> {
  // periodEnd が未指定なら翌日の 00:00 をデフォルトにする
  const end =
    periodEnd ??
    new Date(
      new Date(periodStart).getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();

  // 期間内の投稿を取得
  let query = supabase
    .from('messages')
    .select('author_id, author_name, content, channel_id, created_at')
    .gte('created_at', periodStart)
    .lt('created_at', end)
    .order('created_at', { ascending: true })
    .limit(2000);

  if (channelId) {
    query = query.eq('channel_id', channelId);
  }

  const { data: todayMessages, error } = await query;

  if (error) {
    warn('Failed to fetch today messages for memory extraction', { error });
    return 0;
  }

  if (!todayMessages || todayMessages.length === 0) return 0;

  // チャンネル名を取得
  const channelIds = [...new Set(todayMessages.map((m) => m.channel_id))];
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', channelIds);

  const channelMap = new Map(
    (channels || []).map((c) => [c.id, c.name]),
  );

  // 既存メモリを取得
  const { data: existingMemories } = await supabase
    .from('memories')
    .select('scope, scope_id, category, key, value, confidence')
    .gte('confidence', 0.3);

  const existingMemoriesText = (existingMemories || [])
    .map(
      (m) =>
        `[${m.scope}:${m.scope_id}] ${m.category}: ${m.key} = ${m.value} (confidence: ${m.confidence})`,
    )
    .join('\n');

  // 投稿をユーザー×チャンネルでグルーピングしてテキスト化
  const messagesText = todayMessages
    .map((m) => {
      const chName = channelMap.get(m.channel_id) || String(m.channel_id);
      return `[#${chName}] ${m.author_name}(${m.author_id}): ${m.content}`;
    })
    .join('\n');

  const prompt = buildMemoryExtractionPrompt(
    messagesText,
    existingMemoriesText,
    guildId,
  );

  try {
    const response = await generateMessage(prompt, { timeoutMs: 30000 });
    const memories = parseMemoryResponse(response);

    if (memories.length === 0) {
      info('No memories extracted');
      return 0;
    }

    let count = 0;
    for (const mem of memories) {
      const saved = await upsertMemory(mem);
      if (saved) count++;
    }

    info('Extracted and stored memories', {
      count,
      total: memories.length,
    });
    return count;
  } catch (error) {
    warn('Failed to extract memories', { error });
    return 0;
  }
}

/**
 * メモリ抽出用プロンプトを構築する
 */
function buildMemoryExtractionPrompt(
  messagesText: string,
  existingMemoriesText: string,
  guildId: string,
): string {
  return `以下の Discord 投稿から、ユーザーの特徴、チャンネル固有の用語、サーバー全体の文化を抽出してください。

## 出力形式
JSON 配列のみを返してください。他の文章は不要です。

\`\`\`json
[
  {
    "scope": "user" | "channel" | "server",
    "scopeId": "ユーザーID or チャンネルID or ${guildId}",
    "category": "personality | habit | interest | skill | ongoing | relationship | topic | slang",
    "key": "短いキー（例: カレー好き）",
    "value": "説明（例: 自分でカレーを作るほどカレーが好き）",
    "confidence": 0.5〜1.0
  }
]
\`\`\`

## カテゴリの定義
- personality: 性格（ダジャレ好き、真面目 etc）
- habit: 習慣（5時起き、夜型 etc）
- interest: 趣味・興味（カレー好き、ゲーム開発 etc）
- skill: スキル（TypeScript得意 etc）
- ongoing: 進行中の出来事（ダイエット中 etc）→ 一時的なもの
- relationship: 他ユーザーとの関係（同僚、同じチーム etc）
- topic: チャンネルの主なトピック（scope=channel）
- slang: サーバー固有のスラング（scope=server）

## ルール
- 確信が持てない推測には低い confidence（0.5〜0.6）を付ける
- 明確な発言からの抽出には高い confidence（0.7〜1.0）を付ける
- 挨拶だけの投稿（gm, おはよう等）からは抽出しない
- 既存メモリと重複する場合は出力しない
- 矛盾する場合は新しい情報を出力し、key を同じにする
- 何も抽出できなければ空配列 [] を返す

## 既存メモリ
${existingMemoriesText || '（なし）'}

## 今日の投稿
${messagesText}`;
}

/**
 * Gemini の応答から JSON を抽出してパースする
 */
function parseMemoryResponse(response: string): ExtractedMemory[] {
  try {
    // コードブロック内の JSON を抽出
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (m): m is ExtractedMemory =>
        m &&
        typeof m.scope === 'string' &&
        typeof m.scopeId === 'string' &&
        typeof m.key === 'string' &&
        typeof m.value === 'string',
    );
  } catch {
    warn('Failed to parse memory extraction response', {
      response: response.slice(0, 200),
    });
    return [];
  }
}

const AUTO_PIN_THRESHOLD = 3;

/**
 * メモリを upsert する（embedding 生成含む）
 * 同じ key が既に存在すれば confirmed_count++ し、閾値超えで自動 pin
 */
async function upsertMemory(mem: ExtractedMemory): Promise<boolean> {
  try {
    const scopeId = mem.scopeId;

    // 既存チェック
    const { data: existing } = await supabase
      .from('memories')
      .select('id, confirmed_count, pinned, source')
      .eq('scope', mem.scope)
      .eq('scope_id', scopeId)
      .eq('key', mem.key)
      .single();

    const embedding = await generateEmbedding(mem.value);

    if (existing) {
      // manual は上書きしない
      if (existing.source === 'manual') return false;

      const newCount = (existing.confirmed_count || 1) + 1;
      const shouldPin = newCount >= AUTO_PIN_THRESHOLD;

      const { error } = await supabase
        .from('memories')
        .update({
          value: mem.value,
          confidence: mem.confidence ?? 0.5,
          category: mem.category,
          embedding,
          confirmed_count: newCount,
          pinned: existing.pinned || shouldPin,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        warn('Failed to update memory', { key: mem.key, error });
        return false;
      }
    } else {
      // 新規
      const { error } = await supabase.from('memories').insert({
        scope: mem.scope,
        scope_id: scopeId,
        category: mem.category,
        key: mem.key,
        value: mem.value,
        confidence: mem.confidence ?? 0.5,
        embedding,
        source: 'auto',
        confirmed_count: 1,
        pinned: false,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        warn('Failed to insert memory', { key: mem.key, error });
        return false;
      }
    }
    return true;
  } catch (error) {
    warn('Failed to process memory', { key: mem.key, error });
    return false;
  }
}

/**
 * ongoing メモリの自動減衰処理
 * 1週間更新がないものは毎日 5% ずつ confidence を減らす
 * confidence が 0.3 以下になったら削除
 */
export async function decayOngoingMemories(): Promise<void> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // 5% 減衰
  const { error: decayError } = await supabase.rpc('decay_ongoing_memories', {
    cutoff_date: sevenDaysAgo.toISOString(),
  });

  // RPC が無い場合は直接 SQL 風にやる
  if (decayError) {
    // フォールバック: 対象メモリを取得して個別更新
    const { data: targets } = await supabase
      .from('memories')
      .select('id, confidence')
      .eq('category', 'ongoing')
      .lt('updated_at', sevenDaysAgo.toISOString());

    if (targets && targets.length > 0) {
      for (const t of targets) {
        const newConfidence = t.confidence * 0.95;
        if (newConfidence < 0.3) {
          await supabase.from('memories').delete().eq('id', t.id);
        } else {
          await supabase
            .from('memories')
            .update({
              confidence: newConfidence,
              updated_at: new Date().toISOString(),
            })
            .eq('id', t.id);
        }
      }
      info('Decayed ongoing memories', { count: targets.length });
    }
  }

  // 閾値以下を一括削除
  const { error: deleteError } = await supabase
    .from('memories')
    .delete()
    .lt('confidence', 0.3);

  if (deleteError) {
    warn('Failed to delete low confidence memories', { error: deleteError });
  }
}
