/** Discord channel object from Guild API */
export interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0 = text, 2 = voice, etc.
  permission_overwrites?: PermissionOverwrite[];
}

export interface PermissionOverwrite {
  id: string;
  type: number; // 0 = role, 1 = member
  allow: string;
  deny: string;
}

/** messages テーブルの行 */
export interface MessageRow {
  id: number;
  channel_id: number;
  author_id: number;
  author_name: string;
  content: string;
  created_at: string;
  reaction_count: number;
  reply_to_message_id: number | null;
  conversation_id: number | null;
  embedding: number[] | null;
  fetched_at: string;
}

/** channels テーブルの行 */
export interface ChannelRow {
  id: number;
  name: string;
  last_fetched_message_id: number | null;
  updated_at: string;
}

/** bot_posts テーブルの行 */
export interface BotPostRow {
  id: number;
  channel_id: number;
  content: string;
  mvp_user_id: number | null;
  posted_at: string;
  date_label: string;
}

/** memories テーブルの行 */
export interface MemoryRow {
  id: number;
  scope: 'user' | 'channel' | 'server';
  scope_id: number;
  category: string | null;
  key: string;
  value: string;
  confidence: number;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

/** 当日アクティビティ - 会話単位 */
export interface TodayActivity {
  userId: string;
  userName: string;
  conversations: {
    channelName: string;
    messages: {
      authorName: string;
      authorId: string;
      content: string;
      createdAt: string;
      isMvpUser: boolean;
    }[];
  }[];
}

/** セレンディピティ検索結果 */
export interface SerendipityResult {
  channelName: string;
  authorName: string;
  content: string;
  createdAt: string;
  similarityScore: number;
}

/** ユーザーメモリコンテキスト */
export interface UserMemoryContext {
  userId: string;
  userName: string;
  memories: {
    category: string;
    key: string;
    value: string;
    confidence: number;
    score: number;
  }[];
}

/** チャンネルメモリコンテキスト */
export interface ChannelMemoryContext {
  channelId: string;
  channelName: string;
  memories: {
    key: string;
    value: string;
    confidence: number;
  }[];
}

/** サーバーメモリコンテキスト */
export interface ServerMemoryContext {
  key: string;
  value: string;
}
