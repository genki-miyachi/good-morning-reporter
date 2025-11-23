/**
 * Configuration validation
 */

import { Config } from './types.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate configuration
 * @param config - Configuration object to validate
 * @throws ValidationError if validation fails
 */
export function validateConfig(config: Partial<Config>): void {
  const errors: string[] = [];

  if (!config.discord?.botToken) {
    errors.push('DISCORD_BOT_TOKEN is required');
  }

  if (!config.discord?.channelId) {
    errors.push('CHANNEL_ID is required');
  }

  if (!config.gemini?.apiKey) {
    errors.push('GOOGLE_API_KEY is required');
  }

  if (config.filters?.excludeBots !== undefined) {
    if (typeof config.filters.excludeBots !== 'boolean') {
      errors.push('EXCLUDE_BOTS must be "true" or "false"');
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

