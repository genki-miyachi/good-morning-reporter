/**
 * Configuration type definitions
 */

export interface TimeRangeConfig {
  startHour: number; // 04:00
  endHour: number; // 00:00 (next day)
}

export interface HistoryConfig {
  maxItems: number; // 10
  daysForPrompt: number; // 3
}

export interface DiscordConfig {
  messageLimit: number; // 2000
  apiLimit: number; // 100
}

export interface GeminiConfig {
  retryMax: number;
  retryBaseMs: number;
  retryMaxMs: number;
  timeoutMs: number;
  model: string;
}

export interface MessageFilters {
  excludeBots: boolean;
  excludeUserIds: string[];
}

export interface Config {
  discord: {
    botToken: string;
    channelId: string;
    messageLimit: number;
    apiLimit: number;
  };
  timezone: string;
  timeRange: TimeRangeConfig;
  filters: MessageFilters;
  gemini: {
    apiKey: string;
    model: string;
    timeoutMs: number;
    retryMax: number;
    retryBaseMs: number;
    retryMaxMs: number;
  };
  history: HistoryConfig;
  historyFile: string;
  dryRun: boolean;
}

