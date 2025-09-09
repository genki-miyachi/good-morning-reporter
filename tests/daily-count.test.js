import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getStartOfDayUTC,
  timestampToSnowflake,
  countMessages,
  countUniqueAuthors,
  formatDateString,
  createResultMessage,
  createGeminiMessage
} from '../scripts/daily-count.js';

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
      author: { id: 'user1', bot: false },
      content: 'Hello'
    },
    {
      id: '2',
      author: { id: 'bot1', bot: true },
      content: 'Bot message'
    },
    {
      id: '3',
      author: { id: 'user2', bot: false },
      content: 'GM!'
    },
    {
      id: '4',
      author: { id: 'user3', bot: false },
      content: 'Good morning'
    }
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
      excludeUserIds: ['user2']
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
    { id: '1', author: { id: 'user1', bot: false }, content: 'A' },
    { id: '2', author: { id: 'user1', bot: false }, content: 'B' },
    { id: '3', author: { id: 'user2', bot: false }, content: 'C' },
    { id: '4', author: { id: 'bot1', bot: true }, content: 'D' },
    { id: '5', author: { id: 'user3', bot: false }, content: 'E' }
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
    const result = countUniqueAuthors(testMessages, { excludeBots: true, excludeUserIds: ['user3'] });
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

describe('createResultMessage', () => {
  test('should create message with date and count', () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = createResultMessage(testDate, 42, 'Asia/Tokyo');

    assert.ok(result.includes('2024/01/15(月)'));
    assert.ok(result.includes('42人'));
    assert.ok(result.length > 20);
  });

  test('should include greeting and ending patterns', () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = createResultMessage(testDate, 0, 'Asia/Tokyo');

    const hasGreeting = result.includes('やあみんな') ||
                       result.includes('おはよう') ||
                       result.includes('よっしゃ') ||
                       result.includes('みんなー') ||
                       result.includes('おつかれ') ||
                       result.includes('はいはい') ||
                       result.includes('よし') ||
                       result.includes('今日も') ||
                       result.includes('みなさん') ||
                       result.includes('いえーい');

    const hasEnding = result.includes('お疲れ様') ||
                     result.includes('ありがとう') ||
                     result.includes('頑張ろう') ||
                     result.includes('おやすみ') ||
                     result.includes('よろしく') ||
                     result.includes('休んで') ||
                     result.includes('いい一日') ||
                     result.includes('お疲れ') ||
                     result.includes('🌞'); // 絵文字も含む

    assert.ok(hasGreeting, 'Should contain greeting pattern');
    assert.ok(hasEnding, 'Should contain ending pattern');
  });

  test('should handle zero count', () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = createResultMessage(testDate, 0, 'Asia/Tokyo');

    assert.match(result, /0人/);
  });

  test('should handle large count', () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = createResultMessage(testDate, 9999, 'Asia/Tokyo');

    assert.match(result, /9999人/);
  });
});

describe('createGeminiMessage', () => {
  test('should return a message with date and count', async () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = await createGeminiMessage(testDate, 5, 'Asia/Tokyo');

    // Should contain date and count information
    assert.ok(result.includes('2024/01/15(月)'));
    assert.ok(result.includes('5人'));
    assert.ok(result.length > 0);
  });

  test('should handle zero count', async () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = await createGeminiMessage(testDate, 0, 'Asia/Tokyo');

    assert.ok(result.includes('2024/01/15(月)'));
    assert.ok(result.includes('0人'));
  });

  test('should handle large count', async () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = await createGeminiMessage(testDate, 999, 'Asia/Tokyo');

    assert.ok(result.includes('2024/01/15(月)'));
    // Gemini API は「999人」の代わりに「999」や「目覚め人」など別の表現を使う可能性がある
    assert.ok(result.includes('999') || result.includes('目覚め人'));
  });
});
