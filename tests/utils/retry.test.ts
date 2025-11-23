import { test, describe } from 'node:test';
import assert from 'node:assert';
import { withRetry } from '../../scripts/utils/retry.js';

describe('utils/retry.test.ts', () => {
  describe('withRetry', () => {
  test('should succeed on first attempt', async () => {
    const fn = async () => 'success';
    const result = await withRetry(fn);
    assert.strictEqual(result, 'success');
  });

  test('should retry on retryable error', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw { status: 429 };
      }
      return 'success';
    };

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      isRetryable: (error: unknown) => {
        return error && typeof error === 'object' && 'status' in error &&
          (error as { status: number }).status === 429;
      },
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 2);
  });

  test('should throw on non-retryable error', async () => {
    const fn = async () => {
      throw new Error('Non-retryable error');
    };

    await assert.rejects(
      async () => await withRetry(fn, {
        isRetryable: () => false,
      }),
      /Non-retryable error/
    );
  });

  test('should throw after max attempts', async () => {
    const fn = async () => {
      throw { status: 500 };
    };

    await assert.rejects(
      async () => await withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 10,
        isRetryable: () => true,
      }),
      (error: unknown) => {
        return error && typeof error === 'object' && 'status' in error &&
          (error as { status: number }).status === 500;
      }
    );
  });
});
});

