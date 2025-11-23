import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getStartOfDayUTC,
  getTimeRangeUTC,
  formatDateString,
} from '../../scripts/utils/timezone.js';

describe('utils/timezone.test.ts', () => {
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

  describe('getTimeRangeUTC', () => {
    test('should return correct time range for Asia/Tokyo', () => {
    const testDate = new Date('2024-01-15T12:00:00Z');
    const result = getTimeRangeUTC(testDate, 'Asia/Tokyo');

    assert.ok(result.start instanceof Date);
    assert.ok(result.end instanceof Date);
    assert.ok(result.start < result.end);
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

