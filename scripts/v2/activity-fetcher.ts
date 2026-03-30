import { info } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import { TodayActivity } from './types.js';

/**
 * MVP 候補ユーザーの当日アクティビティを会話単位で取得する
 *
 * conversation_id を使い、ユーザーが参加した会話の全文脈（他ユーザーの投稿含む）を取得
 */
export async function fetchTodayActivities(
  userIds: string[],
  todayStart: string,
  gmChannelId: string,
): Promise<TodayActivity[]> {
  if (userIds.length === 0) return [];

  const activities: TodayActivity[] = [];

  for (const userId of userIds) {
    const activity = await fetchUserActivity(
      userId,
      todayStart,
      gmChannelId,
    );
    if (activity) {
      activities.push(activity);
    }
  }

  info('Fetched today activities', {
    users: activities.length,
    totalConversations: activities.reduce(
      (sum, a) => sum + a.conversations.length,
      0,
    ),
  });

  return activities;
}

/**
 * 1ユーザーの当日アクティビティを取得
 */
async function fetchUserActivity(
  userId: string,
  todayStart: string,
  gmChannelId: string,
): Promise<TodayActivity | null> {
  // Step 1: ユーザーの当日投稿が属する conversation_id を取得
  const { data: userMessages, error: msgError } = await supabase
    .from('messages')
    .select('conversation_id, author_name')
    .eq('author_id', userId)
    .gte('created_at', todayStart)
    .neq('channel_id', gmChannelId)
    .not('conversation_id', 'is', null);

  if (msgError || !userMessages || userMessages.length === 0) return null;

  const userName = userMessages[0].author_name;
  const conversationIds = [
    ...new Set(
      userMessages
        .map((m) => m.conversation_id)
        .filter((id): id is number => id !== null),
    ),
  ];

  if (conversationIds.length === 0) return null;

  // Step 2: 該当 conversation_id のメッセージを全て取得（他ユーザーの投稿含む）
  const { data: convMessages, error: convError } = await supabase
    .from('messages')
    .select('author_name, author_id::text, content, created_at, channel_id, conversation_id')
    .in('conversation_id', conversationIds)
    .order('channel_id', { ascending: true })
    .order('created_at', { ascending: true });

  if (convError || !convMessages || convMessages.length === 0) return null;

  // Step 3: チャンネル名を取得
  const channelIds = [...new Set(convMessages.map((m) => m.channel_id))];
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name')
    .in('id', channelIds);

  const channelMap = new Map(
    (channels || []).map((c) => [c.id, c.name]),
  );

  // Step 4: チャンネル×会話でグルーピング
  const conversationMap = new Map<
    string,
    {
      channelName: string;
      messages: TodayActivity['conversations'][0]['messages'];
    }
  >();

  for (const msg of convMessages) {
    const key = `${msg.channel_id}-${msg.conversation_id}`;
    if (!conversationMap.has(key)) {
      conversationMap.set(key, {
        channelName:
          channelMap.get(msg.channel_id) || String(msg.channel_id),
        messages: [],
      });
    }
    conversationMap.get(key)!.messages.push({
      authorName: msg.author_name,
      authorId: msg.author_id,
      content: msg.content,
      createdAt: msg.created_at,
      isMvpUser: msg.author_id === userId,
    });
  }

  return {
    userId,
    userName,
    conversations: [...conversationMap.values()],
  };
}
