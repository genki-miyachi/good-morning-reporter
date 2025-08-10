import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getStartOfDayUTC,
  timestampToSnowflake,
  countMessages,
  formatDateString,
  createResultMessage
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
    
    // メッセージに必要な要素が含まれることを確認
    assert.ok(result.includes('2024/01/15(月)'));
    assert.ok(result.includes('Good Morning'));
    assert.ok(result.includes('42件'));
    assert.ok(result.length > 50);
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
                     result.includes('お疲れ');
    
    assert.ok(hasGreeting, 'Should contain greeting pattern');
    assert.ok(hasEnding, 'Should contain ending pattern');
  });

  test('should handle zero count', () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = createResultMessage(testDate, 0, 'Asia/Tokyo');
    
    assert.match(result, /0件/);
  });

  test('should handle large count', () => {
    const testDate = new Date('2024-01-15T00:00:00Z');
    const result = createResultMessage(testDate, 9999, 'Asia/Tokyo');
    
    assert.match(result, /9999件/);
  });
});