import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  countMessages,
  countUniqueAuthors,
} from '../../scripts/services/message-counter.js';
import { DiscordMessage } from '../../scripts/types/discord.js';

describe('services/message-counter.test.ts', () => {
  describe('countMessages', () => {
    const testMessages: DiscordMessage[] = [
    {
      id: '1',
      channel_id: 'channel1',
      author: { id: 'user1', bot: false, username: 'user1' },
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '2',
      channel_id: 'channel1',
      author: { id: 'bot1', bot: true, username: 'bot1' },
      content: 'Bot message',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '3',
      channel_id: 'channel1',
      author: { id: 'user2', bot: false, username: 'user2' },
      content: 'GM!',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '4',
      channel_id: 'channel1',
      author: { id: 'user3', bot: false, username: 'user3' },
      content: 'Good morning',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    ];

    test('should count all messages without filters', () => {
      const result = countMessages(testMessages);
      assert.strictEqual(result, 4);
    });

    test('should exclude bot messages when excludeBots is true', () => {
      const result = countMessages(testMessages, { excludeBots: true });
      assert.strictEqual(result, 3);
    });

    test('should exclude specific user IDs', () => {
      const result = countMessages(testMessages, { excludeUserIds: ['user1', 'user3'] });
      assert.strictEqual(result, 2);
    });

    test('should exclude both bots and specific users', () => {
      const result = countMessages(testMessages, {
        excludeBots: true,
        excludeUserIds: ['user2'],
      });
      assert.strictEqual(result, 2);
    });

    test('should handle empty message array', () => {
      const result = countMessages([]);
      assert.strictEqual(result, 0);
    });
  });

  describe('countUniqueAuthors', () => {
    const testMessages: DiscordMessage[] = [
      {
      id: '1',
      channel_id: 'channel1',
      author: { id: 'user1', bot: false, username: 'user1' },
      content: 'A',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '2',
      channel_id: 'channel1',
      author: { id: 'user1', bot: false, username: 'user1' },
      content: 'B',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '3',
      channel_id: 'channel1',
      author: { id: 'user2', bot: false, username: 'user2' },
      content: 'C',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '4',
      channel_id: 'channel1',
      author: { id: 'bot1', bot: true, username: 'bot1' },
      content: 'D',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
    },
    {
      id: '5',
      channel_id: 'channel1',
      author: { id: 'user3', bot: false, username: 'user3' },
      content: 'E',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
      },
    ];

    test('should count unique authors (bots included)', () => {
      const result = countUniqueAuthors(testMessages);
      assert.strictEqual(result, 4);
    });

    test('should exclude bots when excludeBots is true', () => {
      const result = countUniqueAuthors(testMessages, { excludeBots: true });
      assert.strictEqual(result, 3);
    });

    test('should exclude specific users', () => {
      const result = countUniqueAuthors(testMessages, { excludeUserIds: ['user1'] });
      assert.strictEqual(result, 3);
    });

    test('should exclude bots and specific users', () => {
      const result = countUniqueAuthors(testMessages, {
        excludeBots: true,
        excludeUserIds: ['user3'],
      });
      assert.strictEqual(result, 2);
    });
  });
});
