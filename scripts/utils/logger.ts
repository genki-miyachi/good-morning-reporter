/**
 * Structured logging utilities
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogMeta {
  [key: string]: unknown;
}

/**
 * Log an info message
 */
export function info(message: string, meta: LogMeta = {}): void {
  const logEntry = {
    level: 'info' as const,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Log a warning message
 */
export function warn(message: string, meta: LogMeta = {}): void {
  const logEntry = {
    level: 'warn' as const,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  console.warn(JSON.stringify(logEntry));
}

/**
 * Log an error message
 */
export function error(message: string, error: Error | unknown, meta: LogMeta = {}): void {
  const errorObj = error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    : { message: String(error) };

  const logEntry = {
    level: 'error' as const,
    message,
    error: errorObj,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  console.error(JSON.stringify(logEntry));
}

