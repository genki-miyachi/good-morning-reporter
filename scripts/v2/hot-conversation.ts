import { info } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import { HotConversationContext } from './types.js';

/** 抜粋に含めるメッセージの最大数 */
const MAX_EXCERPT_MESSAGES = 8;
/** 「盛り上がり」と見なす最低参加者数 */
const MIN_PARTICIPANTS = 3;

interface ConvMessage {
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  channel_id: number;
  conversation_id: number;
  reaction_count: number;
}

/**
 * 当日の gm 以外のチャンネルで最も盛り上がった会話を 1 件返す。
 *
 * conversation_id 単位で「参加者数・リアクション・メッセージ数」をスコア化し、
 * 主役ユーザー（最もリアクションを集めた人）と会話抜粋を添えて返す。
 * gm していない人にも「その話もっと聞きたい」と呼びかけ、翌日以降の gm を促す材料にする。
 */
export async function fetchHotConversation(
  todayStart: string,
  gmChannelId: string,
): Promise<HotConversationContext | null> {
  // 当日・gm 以外・会話に束ねられている投稿を取得
  const { data, error } = await supabase
    .from('messages')
    .select(
      'author_id::text, author_name, content, created_at, channel_id, conversation_id, reaction_count',
    )
    .gte('created_at', todayStart)
    .neq('channel_id', gmChannelId)
    .not('conversation_id', 'is', null);

  if (error || !data || data.length === 0) return null;

  const messages = data as ConvMessage[];

  // conversation_id ごとにグルーピング
  const convMap = new Map<number, ConvMessage[]>();
  for (const msg of messages) {
    const list = convMap.get(msg.conversation_id);
    if (list) list.push(msg);
    else convMap.set(msg.conversation_id, [msg]);
  }

  // スコアリングして最良の会話を選ぶ
  let best: { msgs: ConvMessage[]; score: number; participants: number } | null =
    null;

  for (const msgs of convMap.values()) {
    const participants = new Set(msgs.map((m) => m.author_id)).size;
    if (participants < MIN_PARTICIPANTS) continue;

    const totalReactions = msgs.reduce((sum, m) => sum + m.reaction_count, 0);
    const score = participants * 3 + totalReactions * 2 + msgs.length;

    if (!best || score > best.score) {
      best = { msgs, score, participants };
    }
  }

  if (!best) return null;

  const { msgs } = best;

  // 主役 = リアクション合計が最大のユーザー（同点はメッセージ数で決定）
  const byUser = new Map<
    string,
    { authorName: string; reactions: number; count: number }
  >();
  for (const m of msgs) {
    const cur = byUser.get(m.author_id) ?? {
      authorName: m.author_name,
      reactions: 0,
      count: 0,
    };
    cur.reactions += m.reaction_count;
    cur.count += 1;
    byUser.set(m.author_id, cur);
  }

  let starUserId = '';
  let starUserName = '';
  let starReactions = -1;
  let starCount = -1;
  for (const [userId, stats] of byUser) {
    if (
      stats.reactions > starReactions ||
      (stats.reactions === starReactions && stats.count > starCount)
    ) {
      starUserId = userId;
      starUserName = stats.authorName;
      starReactions = stats.reactions;
      starCount = stats.count;
    }
  }

  // チャンネル名を取得
  const channelId = msgs[0].channel_id;
  const { data: channels } = await supabase
    .from('channels')
    .select('name')
    .eq('id', channelId)
    .limit(1);
  const channelName = channels?.[0]?.name ?? String(channelId);

  // 抜粋（時系列昇順、空投稿を除外、先頭から最大数件）
  const sorted = [...msgs].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
  const excerpt = sorted
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(0, MAX_EXCERPT_MESSAGES)
    .map((m) => ({
      authorName: m.author_name,
      authorId: m.author_id,
      content: m.content,
      isStar: m.author_id === starUserId,
    }));

  const result: HotConversationContext = {
    channelId: String(channelId),
    channelName,
    participantCount: best.participants,
    messageCount: msgs.length,
    totalReactions: msgs.reduce((sum, m) => sum + m.reaction_count, 0),
    starUserId,
    starUserName,
    excerpt,
  };

  info('Fetched hot conversation', {
    channelName,
    participants: result.participantCount,
    messages: result.messageCount,
    reactions: result.totalReactions,
    star: starUserName,
  });

  return result;
}
