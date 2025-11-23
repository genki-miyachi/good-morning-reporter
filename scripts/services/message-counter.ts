/**
 * Message counting service
 */

import { DiscordMessage } from '../types/discord.js';

export interface MessageFilter {
  excludeBots?: boolean;
  excludeUserIds?: string[];
}

/**
 * Count messages with filters applied
 * @param messages - Array of Discord messages
 * @param filters - Filter options
 * @returns Count of messages
 */
export function countMessages(
  messages: DiscordMessage[],
  filters: MessageFilter = {}
): number {
  const { excludeBots = false, excludeUserIds = [] } = filters;

  return messages.filter((message) => {
    if (excludeBots && message.author.bot) {
      return false;
    }

    if (excludeUserIds.includes(message.author.id)) {
      return false;
    }

    return true;
  }).length;
}

/**
 * Count unique authors with filters applied
 * @param messages - Array of Discord messages
 * @param filters - Filter options
 * @returns Count of unique authors
 */
export function countUniqueAuthors(
  messages: DiscordMessage[],
  filters: MessageFilter = {}
): number {
  const { excludeBots = false, excludeUserIds = [] } = filters;

  const uniqueAuthorIds = new Set<string>();

  for (const message of messages) {
    if (excludeBots && message.author.bot) {
      continue;
    }
    if (excludeUserIds.includes(message.author.id)) {
      continue;
    }
    uniqueAuthorIds.add(message.author.id);
  }

  return uniqueAuthorIds.size;
}

