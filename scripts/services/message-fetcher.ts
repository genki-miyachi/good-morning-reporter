/**
 * Message fetching service
 */

import { getAllMessages } from '../discord-client.js';
import { timestampToSnowflake } from '../utils/snowflake.js';
import { getTimeRangeUTC } from '../utils/timezone.js';
import { DiscordMessage } from '../types/discord.js';
import { Config } from '../config/types.js';

/**
 * Fetch daily messages for counting
 * @param config - Configuration object
 * @returns Array of Discord messages
 */
export async function fetchDailyMessages(config: Config): Promise<DiscordMessage[]> {
  const now = new Date();
  const timeRange = getTimeRangeUTC(now, config.timezone);
  const startSnowflake = timestampToSnowflake(timeRange.start.getTime());

  const messages = await getAllMessages(
    config.discord.channelId,
    startSnowflake,
    config.discord.botToken,
    timeRange.end.getTime()
  );

  return messages;
}

