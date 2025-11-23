import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  timestampToSnowflake,
  snowflakeToTimestampMs,
  DISCORD_EPOCH,
} from '../../scripts/utils/snowflake.js';

describe('utils/snowflake.test.ts', () => {
  describe('timestampToSnowflake', () => {
    test('should convert timestamp to Discord snowflake', () => {
      const timestamp = 1640995200000;
    const result = timestampToSnowflake(timestamp);

    const expectedSnowflake = ((BigInt(timestamp) - BigInt(DISCORD_EPOCH)) << 22n).toString();
    assert.strictEqual(result, expectedSnowflake);
  });

    test('should handle Discord epoch timestamp', () => {
      const timestamp = DISCORD_EPOCH;
      const result = timestampToSnowflake(timestamp);

      assert.strictEqual(result, '0');
    });

    test('should handle future timestamp', () => {
      const timestamp = 2000000000000;
      const result = timestampToSnowflake(timestamp);

      const expectedSnowflake = ((BigInt(timestamp) - BigInt(DISCORD_EPOCH)) << 22n).toString();
      assert.strictEqual(result, expectedSnowflake);
    });
  });

  describe('snowflakeToTimestampMs', () => {
    test('should convert snowflake to timestamp', () => {
    const timestamp = 1640995200000;
    const snowflake = timestampToSnowflake(timestamp);
    const result = snowflakeToTimestampMs(snowflake);

    // Allow some margin for precision loss
    assert.ok(Math.abs(result - timestamp) < 1000);
  });

    test('should handle zero snowflake', () => {
      const result = snowflakeToTimestampMs('0');
      assert.strictEqual(result, DISCORD_EPOCH);
    });

    test('should return 0 for invalid snowflake', () => {
      const result = snowflakeToTimestampMs('invalid');
      assert.strictEqual(result, 0);
    });
  });
});

