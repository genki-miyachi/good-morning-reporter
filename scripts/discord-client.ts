/**
 * Discord API client
 */

import { DISCORD_EPOCH, snowflakeToTimestampMs } from './utils/snowflake.js';
import { withRetry } from './utils/retry.js';
import { DiscordMessage } from './types/discord.js';
import { info, warn } from './utils/logger.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

// Re-export for backward compatibility
export { timestampToSnowflake, DISCORD_EPOCH } from './utils/snowflake.js';
export { snowflakeToTimestampMs };

/**
 * Fetch messages from Discord API
 */
export async function fetchMessages(
  channelId: string,
  afterSnowflake: string | null,
  token: string
): Promise<DiscordMessage[]> {
  const url = new URL(`${DISCORD_API_BASE}/channels/${channelId}/messages`);
  url.searchParams.set('limit', '100');
  if (afterSnowflake) {
    url.searchParams.set('after', afterSnowflake);
  }

  return withRetry(
    async () => {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': 'Discord-GM-Counter/1.0',
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
        const waitTime = Math.min(retryAfter * 1000, 60000);
        warn('Rate limited, waiting', { waitTime });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        // Retry will be handled by withRetry
        throw { status: 429, retryAfter: waitTime };
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord API error: ${response.status} ${errorText}`);
      }

      return response.json() as Promise<DiscordMessage[]>;
    },
    {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      isRetryable: (error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          return status === 429;
        }
        return false;
      },
    }
  );
}

/**
 * Get all messages within a time range
 */
export async function getAllMessages(
  channelId: string,
  startSnowflake: string,
  token: string,
  endTimestampMs: number
): Promise<DiscordMessage[]> {
  const allMessages: DiscordMessage[] = [];
  let afterSnowflake: string | null = startSnowflake;
  let pageCount = 0;

  while (true) {
    const messages = await fetchMessages(channelId, afterSnowflake, token);

    if (messages.length === 0) {
      break;
    }

    const within: DiscordMessage[] = [];
    for (const m of messages) {
      const ts = snowflakeToTimestampMs(m.id);
      if (ts <= endTimestampMs) {
        within.push(m);
      } else {
        break;
      }
    }
    allMessages.push(...within);

    if (within.length < messages.length) {
      pageCount++;
      break;
    }
    pageCount++;

    afterSnowflake = messages[messages.length - 1].id;

    if (messages.length < 100) {
      break;
    }
  }

  info('Fetched messages', {
    count: allMessages.length,
    pages: pageCount,
  });

  return allMessages;
}

/**
 * Post result message to Discord
 */
export async function postResult(
  channelId: string,
  content: string,
  token: string
): Promise<DiscordMessage> {
  return withRetry(
    async () => {
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Discord-GM-Counter/1.0',
          },
          body: JSON.stringify({ content }),
        }
      );

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
        const waitTime = Math.min(retryAfter * 1000, 60000);
        warn('Rate limited, waiting', { waitTime });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        throw { status: 429, retryAfter: waitTime };
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to post message: ${response.status} ${errorText}`);
      }

      return response.json() as Promise<DiscordMessage>;
    },
    {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      isRetryable: (error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          return status === 429;
        }
        return false;
      },
    }
  );
}

