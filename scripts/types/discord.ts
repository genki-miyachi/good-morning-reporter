/**
 * Discord API type definitions
 */

export interface DiscordAuthor {
  id: string;
  username: string;
  global_name?: string;
  bot: boolean;
}

export interface DiscordReaction {
  emoji: {
    name: string;
  };
  count: number;
}

export interface DiscordAttachment {
  filename: string;
  url: string;
  size: number;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordAuthor;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  reactions?: DiscordReaction[];
  attachments?: DiscordAttachment[];
  embeds?: DiscordEmbed[];
}

export interface DiscordAPIError {
  code: number;
  message: string;
  errors?: unknown;
}

export interface DiscordRateLimitError {
  retry_after: number;
  global: boolean;
}

