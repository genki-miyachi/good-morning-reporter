import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  loadHistory,
  saveHistory,
  pickRecentBotPosts,
} from '../../scripts/services/history-manager.js';
import { HistoryEntry } from '../../scripts/types/history.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('services/history-manager.test.ts', () => {
  describe('history-manager', () => {
  let testHistoryFile: string;

  beforeEach(async () => {
    testHistoryFile = path.join(tmpdir(), `test-history-${Date.now()}.json`);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testHistoryFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('loadHistory', () => {
    test('should return empty array if file does not exist', async () => {
      const result = await loadHistory(testHistoryFile);
      assert.strictEqual(result.length, 0);
    });

    test('should load history from file', async () => {
      const testHistory: HistoryEntry[] = [
        {
          postedAt: '2024-01-01T00:00:00Z',
          dateStr: '2024/01/01(月)',
          content: 'Test message',
        },
      ];
      await fs.writeFile(testHistoryFile, JSON.stringify(testHistory));

      const result = await loadHistory(testHistoryFile);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].dateStr, '2024/01/01(月)');
    });

    test('should return empty array for invalid JSON', async () => {
      await fs.writeFile(testHistoryFile, 'invalid json');
      const result = await loadHistory(testHistoryFile);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('saveHistory', () => {
    test('should save history to file', async () => {
      const testHistory: HistoryEntry[] = [
        {
          postedAt: '2024-01-01T00:00:00Z',
          dateStr: '2024/01/01(月)',
          content: 'Test message',
        },
      ];

      await saveHistory(testHistoryFile, testHistory, 10);
      const result = await loadHistory(testHistoryFile);
      assert.strictEqual(result.length, 1);
    });

    test('should limit history items', async () => {
      const testHistory: HistoryEntry[] = Array.from({ length: 15 }, (_, i) => ({
        postedAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        dateStr: `2024/01/${String(i + 1).padStart(2, '0')}(月)`,
        content: `Message ${i}`,
      }));

      await saveHistory(testHistoryFile, testHistory, 10);
      const result = await loadHistory(testHistoryFile);
      assert.strictEqual(result.length, 10);
    });
  });

  describe('pickRecentBotPosts', () => {
    test('should pick recent bot posts', () => {
      const history: HistoryEntry[] = [
        {
          postedAt: '2024-01-01T00:00:00Z',
          dateStr: '2024/01/01(月)',
          content: 'Message 1',
        },
        {
          postedAt: '2024-01-02T00:00:00Z',
          dateStr: '2024/01/02(火)',
          content: 'Message 2',
        },
        {
          postedAt: '2024-01-03T00:00:00Z',
          dateStr: '2024/01/03(水)',
          content: 'Message 3',
        },
      ];

      const result = pickRecentBotPosts(history, { days: 2 });
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].dateStr, '2024/01/02(火)');
      assert.strictEqual(result[1].dateStr, '2024/01/03(水)');
    });

    test('should handle duplicate date strings', () => {
      const history: HistoryEntry[] = [
        {
          postedAt: '2024-01-01T00:00:00Z',
          dateStr: '2024/01/01(月)',
          content: 'Message 1',
        },
        {
          postedAt: '2024-01-01T12:00:00Z',
          dateStr: '2024/01/01(月)',
          content: 'Message 2',
        },
      ];

      const result = pickRecentBotPosts(history, { days: 3 });
      assert.strictEqual(result.length, 1);
    });
  });
});
});

