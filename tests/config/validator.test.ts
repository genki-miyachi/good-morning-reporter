import { test, describe } from 'node:test';
import assert from 'node:assert';
import { validateConfig, ValidationError } from '../../scripts/config/validator.js';
import { Config } from '../../scripts/config/types.js';

describe('config/validator.test.ts', () => {
  describe('validator', () => {
  test('should validate valid config', () => {
    const config: Partial<Config> = {
      discord: {
        botToken: 'token',
        channelId: 'channel',
        messageLimit: 2000,
        apiLimit: 100,
      },
      gemini: {
        apiKey: 'key',
        model: 'model',
        timeoutMs: 15000,
        retryMax: 5,
        retryBaseMs: 1000,
        retryMaxMs: 10000,
      },
      filters: {
        excludeBots: false,
        excludeUserIds: [],
      },
    };

    assert.doesNotThrow(() => validateConfig(config));
  });

  test('should throw on missing DISCORD_BOT_TOKEN', () => {
    const config: Partial<Config> = {
      discord: {
        botToken: '',
        channelId: 'channel',
        messageLimit: 2000,
        apiLimit: 100,
      },
    };

    assert.throws(
      () => validateConfig(config),
      (error: unknown) => error instanceof ValidationError && /DISCORD_BOT_TOKEN is required/.test(error.message)
    );
  });

  test('should throw on missing CHANNEL_ID', () => {
    const config: Partial<Config> = {
      discord: {
        botToken: 'token',
        channelId: '',
        messageLimit: 2000,
        apiLimit: 100,
      },
    };

    assert.throws(
      () => validateConfig(config),
      (error: unknown) => error instanceof ValidationError && /CHANNEL_ID is required/.test(error.message)
    );
  });

  test('should throw on missing GOOGLE_API_KEY', () => {
    const config: Partial<Config> = {
      discord: {
        botToken: 'token',
        channelId: 'channel',
        messageLimit: 2000,
        apiLimit: 100,
      },
      gemini: {
        apiKey: '',
        model: 'model',
        timeoutMs: 15000,
        retryMax: 5,
        retryBaseMs: 1000,
        retryMaxMs: 10000,
      },
    };

    assert.throws(
      () => validateConfig(config),
      (error: unknown) => error instanceof ValidationError && /GOOGLE_API_KEY is required/.test(error.message)
    );
  });
});
});

