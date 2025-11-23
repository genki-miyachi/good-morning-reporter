import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  fetchMessages,
  getAllMessages,
  postResult,
} from '../scripts/discord-client.js';
import { setupMockFetch, resetMockFetch, MockFetchHandler } from './helpers/mock-fetch.js';
import { DiscordMessage } from '../scripts/types/discord.js';

describe('discord-client.test.ts', () => {
  beforeEach(() => {
    setupMockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '',
    }));
  });

  afterEach(() => {
    resetMockFetch();
  });

  describe('discord-client', () => {
    describe('fetchMessages', () => {
    test('should fetch messages successfully', async () => {
      const mockMessages: DiscordMessage[] = [
        {
          id: '123',
          channel_id: 'channel1',
          author: { id: 'user1', bot: false, username: 'user1' },
          content: 'Hello',
          timestamp: '2024-01-01T00:00:00Z',
          edited_timestamp: null,
        },
      ];

      setupMockFetch(() => ({
        ok: true,
        status: 200,
        json: async () => mockMessages,
      }));

      const result = await fetchMessages('channel1', null, 'token');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, '123');
    });

    test('should handle rate limit (429)', async () => {
      let callCount = 0;
      const handler: MockFetchHandler = () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            headers: { 'Retry-After': '1' },
            json: async () => ({}),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      };

      setupMockFetch(handler);
      const result = await fetchMessages('channel1', null, 'token');
      assert.ok(Array.isArray(result));
    });

    test('should throw error on API error', async () => {
      setupMockFetch(() => ({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }));

      await assert.rejects(
        async () => await fetchMessages('channel1', null, 'token'),
        /Discord API error: 401/
      );
    });
  });

  describe('getAllMessages', () => {
    test('should handle pagination', async () => {
      let callCount = 0;
      const handler: MockFetchHandler = () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => Array.from({ length: 100 }, (_, i) => ({
              id: `${i}`,
              channel_id: 'channel1',
              author: { id: 'user1', bot: false, username: 'user1' },
              content: `Message ${i}`,
              timestamp: '2024-01-01T00:00:00Z',
              edited_timestamp: null,
            })),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      };

      setupMockFetch(handler);
      const result = await getAllMessages('channel1', '0', 'token', Date.now());
      assert.ok(Array.isArray(result));
    });
  });

  describe('postResult', () => {
    test('should post message successfully', async () => {
      const mockResponse: DiscordMessage = {
        id: '123',
        channel_id: 'channel1',
        author: { id: 'bot1', bot: true, username: 'bot1' },
        content: 'Test message',
        timestamp: '2024-01-01T00:00:00Z',
        edited_timestamp: null,
      };

      setupMockFetch(() => ({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      }));

      const result = await postResult('channel1', 'Test message', 'token');
      assert.strictEqual(result.id, '123');
      assert.strictEqual(result.content, 'Test message');
    });

    test('should handle rate limit', async () => {
      let callCount = 0;
      const handler: MockFetchHandler = () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            headers: { 'Retry-After': '1' },
            json: async () => ({}),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: '123',
            channel_id: 'channel1',
            author: { id: 'bot1', bot: true, username: 'bot1' },
            content: 'Test',
            timestamp: '2024-01-01T00:00:00Z',
            edited_timestamp: null,
          }),
        };
      };

      setupMockFetch(handler);
      const result = await postResult('channel1', 'Test', 'token');
      assert.ok(result);
    });
  });
  });
});

