import { withRetry } from '../utils/retry.js';
import { info, warn } from '../utils/logger.js';
import { DiscordChannel } from './types.js';
import { supabase } from './supabase-client.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

// VIEW_CHANNEL permission bit
const VIEW_CHANNEL_BIT = BigInt(1 << 10);

/**
 * Guild の全テキストチャンネルを取得し、Private チャンネルを除外する
 */
export async function fetchPublicTextChannels(
  guildId: string,
  token: string,
  excludeChannelIds: string[] = [],
): Promise<DiscordChannel[]> {
  const channels = await fetchGuildChannels(guildId, token);

  const publicTextChannels = channels.filter((ch) => {
    // テキストチャンネル (type: 0) のみ
    if (ch.type !== 0) return false;

    // 除外リストに含まれるチャンネルを除外
    if (excludeChannelIds.includes(ch.id)) return false;

    // @everyone ロールが VIEW_CHANNEL を拒否しているチャンネルを除外
    // @everyone ロールの ID は guild_id と同じ
    if (ch.permission_overwrites) {
      const everyoneOverwrite = ch.permission_overwrites.find(
        (ow) => ow.id === guildId,
      );
      if (everyoneOverwrite) {
        const deny = BigInt(everyoneOverwrite.deny);
        if ((deny & VIEW_CHANNEL_BIT) !== BigInt(0)) {
          return false;
        }
      }
    }

    return true;
  });

  info('Fetched public text channels', {
    total: channels.length,
    publicText: publicTextChannels.length,
    excluded: excludeChannelIds.length,
  });

  return publicTextChannels;
}

/**
 * Discord Guild API でチャンネル一覧を取得
 */
async function fetchGuildChannels(
  guildId: string,
  token: string,
): Promise<DiscordChannel[]> {
  return withRetry(
    async () => {
      const response = await fetch(
        `${DISCORD_API_BASE}/guilds/${guildId}/channels`,
        {
          headers: {
            Authorization: `Bot ${token}`,
            'User-Agent': 'Discord-GM-Counter/2.0',
          },
        },
      );

      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get('Retry-After') || '1',
        );
        const waitTime = Math.min(retryAfter * 1000, 60000);
        warn('Rate limited, waiting', { waitTime });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        throw { status: 429, retryAfter: waitTime };
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Discord Guild API error: ${response.status} ${errorText}`,
        );
      }

      return response.json() as Promise<DiscordChannel[]>;
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
    },
  );
}

/**
 * channels テーブルを同期（新規チャンネルは INSERT、既存は名前を UPDATE）
 */
export async function syncChannels(
  channels: DiscordChannel[],
): Promise<void> {
  for (const ch of channels) {
    const { error } = await supabase
      .from('channels')
      .upsert(
        {
          id: ch.id,
          name: ch.name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id', ignoreDuplicates: false },
      );

    if (error) {
      warn('Failed to upsert channel', { channelId: ch.id, error });
    }
  }

  info('Synced channels to DB', { count: channels.length });
}
