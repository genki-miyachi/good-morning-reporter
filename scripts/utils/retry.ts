/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    isRetryable = (error: unknown) => {
      // Default: retry on 429 or 5xx errors
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        return status === 429 || (status >= 500 && status < 600);
      }
      return false;
    },
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const shouldRetry = isRetryable(error) && attempt < maxAttempts;

      if (!shouldRetry) {
        throw error;
      }

      // Exponential backoff with jitter
      const backoff = Math.min(
        Math.floor(baseDelayMs * Math.pow(2, attempt - 1) * (1 + Math.random() * 0.2)),
        maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError;
}

