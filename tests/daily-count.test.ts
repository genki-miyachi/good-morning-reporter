import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getStartOfDayUTC,
  timestampToSnowflake,
  countMessages,
  countUniqueAuthors,
  formatDateString,
} from '../scripts/daily-count.js';

describe('daily-count.test.ts', () => {
  describe('getStartOfDayUTC', () => {
    test('should return start of day in UTC for Asia/Tokyo timezone', () => {
      const testDate = new Date('2024-01-15T15:30:00Z');
      const result = getStartOfDayUTC(testDate, 'Asia/Tokyo');

    const expectedUTC = new Date('2024-01-15T15:00:00Z');
    assert.strictEqual(result.getTime(), expectedUTC.getTime());
  });

  test('should return start of day in UTC for America/New_York timezone', () => {
    const testDate = new Date('2024-07-15T10:30:00Z');
    const result = getStartOfDayUTC(testDate, 'America/New_York');

    const expectedUTC = new Date('2024-07-15T04:00:00Z');
    assert.strictEqual(result.getTime(), expectedUTC.getTime());
  });

  test('should handle edge case around midnight', () => {
    const testDate = new Date('2024-01-15T00:30:00Z');
    const result = getStartOfDayUTC(testDate, 'Asia/Tokyo');

    const expectedUTC = new Date('2024-01-14T15:00:00Z');
    assert.strictEqual(result.getTime(), expectedUTC.getTime());
  });
  });

  describe('timestampToSnowflake', () => {
    test('should convert timestamp to Discord snowflake', () => {
      const timestamp = 1640995200000;
      const result = timestampToSnowflake(timestamp);

      const expectedSnowflake = ((BigInt(timestamp) - BigInt(1420070400000)) << 22n).toString();
      assert.strictEqual(result, expectedSnowflake);
    });

    test('should handle Discord epoch timestamp', () => {
      const timestamp = 1420070400000;
      const result = timestampToSnowflake(timestamp);

      assert.strictEqual(result, '0');
    });

    test('should handle future timestamp', () => {
      const timestamp = 2000000000000;
      const result = timestampToSnowflake(timestamp);

      const expectedSnowflake = ((BigInt(timestamp) - BigInt(1420070400000)) << 22n).toString();
      assert.strictEqual(result, expectedSnowflake);
    });
  });

  describe('countMessages', () => {
    const testMessages = [
      {
        id: '1',
        author: { id: 'user1', bot: false, username: 'user1' },
        content: 'Hello',
      },
      {
        id: '2',
        author: { id: 'bot1', bot: true, username: 'bot1' },
        content: 'Bot message',
      },
      {
        id: '3',
        author: { id: 'user2', bot: false, username: 'user2' },
        content: 'GM!',
      },
      {
        id: '4',
        author: { id: 'user3', bot: false, username: 'user3' },
        content: 'Good morning',
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

    test('should handle empty exclude list', () => {
      const result = countMessages(testMessages, { excludeUserIds: [] });
      assert.strictEqual(result, 4);
    });
  });

  describe('countUniqueAuthors', () => {
    const testMessages = [
      { id: '1', author: { id: 'user1', bot: false, username: 'user1' }, content: 'A' },
      { id: '2', author: { id: 'user1', bot: false, username: 'user1' }, content: 'B' },
      { id: '3', author: { id: 'user2', bot: false, username: 'user2' }, content: 'C' },
      { id: '4', author: { id: 'bot1', bot: true, username: 'bot1' }, content: 'D' },
      { id: '5', author: { id: 'user3', bot: false, username: 'user3' }, content: 'E' },
    ];

    test('should count unique non-bot authors by default (bots included)', () => {
      const result = countUniqueAuthors(testMessages);
      // botsも含むと4
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

  describe('formatDateString', () => {
    test('should format date for Asia/Tokyo timezone', () => {
      const testDate = new Date('2024-01-15T15:00:00Z');
      const result = formatDateString(testDate, 'Asia/Tokyo');

      assert.match(result, /2024\/01\/16\([月火水木金土日]\)/);
    });

    test('should format date for America/New_York timezone', () => {
      const testDate = new Date('2024-01-15T10:00:00Z');
      const result = formatDateString(testDate, 'America/New_York');

      assert.match(result, /2024\/01\/15\([月火水木金土日]\)/);
    });

    test('should handle different months and years', () => {
      const testDate = new Date('2023-12-31T15:00:00Z');
      const result = formatDateString(testDate, 'Asia/Tokyo');

      assert.match(result, /2024\/01\/01\([月火水木金土日]\)/);
    });
  });
});
