/**
 * Configuration management
 */

import { config } from 'dotenv';
import * as path from 'node:path';
import { Config } from './types.js';
import { validateConfig } from './validator.js';

// Load .env file
config();

// Constants
const DEFAULT_TIME_RANGE = {
  startHour: 4, // 04:00
  endHour: 0, // 00:00 (next day)
};

const DEFAULT_HISTORY_CONFIG = {
  maxItems: 10,
  daysForPrompt: 3,
};

const DEFAULT_DISCORD_CONFIG = {
  messageLimit: 2000,
  apiLimit: 100,
};

const DEFAULT_GEMINI_CONFIG = {
  retryMax: 5,
  retryBaseMs: 1000,
  retryMaxMs: 10000,
  timeoutMs: 15000,
  model: 'gemini-2.0-flash',
};

/**
 * Get configuration from environment variables
 * @returns Configuration object
 */
export function getConfig(): Config {
  const excludeBots = process.env.EXCLUDE_BOTS === 'true';
    const excludeUserIds = process.env.EXCLUDE_USER_IDS
      ? process.env.EXCLUDE_USER_IDS.split(',').map((id: string) => id.trim()).filter((id: string) => id)
      : [];

  const config: Config = {
    discord: {
      botToken: process.env.DISCORD_BOT_TOKEN || '',
      channelId: process.env.CHANNEL_ID || '',
      messageLimit: DEFAULT_DISCORD_CONFIG.messageLimit,
      apiLimit: DEFAULT_DISCORD_CONFIG.apiLimit,
    },
    timezone: process.env.TIMEZONE || 'Asia/Tokyo',
    timeRange: DEFAULT_TIME_RANGE,
    filters: {
      excludeBots,
      excludeUserIds,
    },
    gemini: {
      apiKey: process.env.GOOGLE_API_KEY || '',
      model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_CONFIG.model,
      timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_GEMINI_CONFIG.timeoutMs,
      retryMax: Number(process.env.GEMINI_RETRY_MAX) || DEFAULT_GEMINI_CONFIG.retryMax,
      retryBaseMs: Number(process.env.GEMINI_RETRY_BASE_MS) || DEFAULT_GEMINI_CONFIG.retryBaseMs,
      retryMaxMs: Number(process.env.GEMINI_RETRY_MAX_MS) || DEFAULT_GEMINI_CONFIG.retryMaxMs,
    },
    history: DEFAULT_HISTORY_CONFIG,
    historyFile: path.resolve(process.cwd(), '.gm_history.json'),
    dryRun: process.env.DRY_RUN === 'true',
  };

  validateConfig(config);
  return config;
}

