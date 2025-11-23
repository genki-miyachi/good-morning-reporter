import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fetchDailyMessages } from '../../scripts/services/message-fetcher.js';
import { Config } from '../../scripts/config/types.js';
import { setupMockFetch, resetMockFetch } from '../helpers/mock-fetch.js';

describe('services/message-fetcher.test.ts', () => {
  const mockConfig: Config = {
    discord: {
      botToken: 'test-token',
      channelId: 'test-channel',
      messageLimit: 2000,
      apiLimit: 100,
    },
    timezone: 'Asia/Tokyo',
    timeRange: {
      startHour: 4,
      endHour: 0,
    },
    filters: {
      excludeBots: false,
      excludeUserIds: [],
    },
    gemini: {
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
      timeoutMs: 15000,
      retryMax: 5,
      retryBaseMs: 1000,
      retryMaxMs: 10000,
    },
    history: {
      maxItems: 10,
      daysForPrompt: 3,
    },
    historyFile: '.gm_history.json',
    dryRun: false,
  };

  beforeEach(() => {
    setupMockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
  });

  afterEach(() => {
    resetMockFetch();
  });

  describe('message-fetcher', () => {
    test('should fetch daily messages', async () => {
      const result = await fetchDailyMessages(mockConfig);
      assert.ok(Array.isArray(result));
    });
  });
});

