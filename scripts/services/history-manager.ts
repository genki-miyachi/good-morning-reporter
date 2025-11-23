/**
 * History management service
 */

import { promises as fs } from 'fs';
import { HistoryEntry, RecentBotPost } from '../types/history.js';
import { Config } from '../config/types.js';

/**
 * Load history from file
 * @param historyFile - Path to history file
 * @returns Array of history entries
 */
export async function loadHistory(historyFile: string): Promise<HistoryEntry[]> {
  try {
    const data = await fs.readFile(historyFile, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Save history to file
 * @param historyFile - Path to history file
 * @param entries - Array of history entries
 * @param maxItems - Maximum number of items to keep
 */
export async function saveHistory(
  historyFile: string,
  entries: HistoryEntry[],
  maxItems: number
): Promise<void> {
  const safe = Array.isArray(entries) ? entries.slice(-maxItems) : [];
  await fs.writeFile(historyFile, JSON.stringify(safe, null, 2));
}

/**
 * Pick recent bot posts for prompt
 * @param historyEntries - Array of history entries
 * @param days - Number of days to look back
 * @param now - Current date/time
 * @returns Array of recent bot posts
 */
export function pickRecentBotPosts(
  historyEntries: HistoryEntry[],
  { days = 3, now = new Date() }: { days?: number; now?: Date } = {}
): RecentBotPost[] {
  if (!Array.isArray(historyEntries)) {
    return [];
  }

  // Sort by postedAt (newest first)
  const sorted = historyEntries
    .filter(
      (e) =>
        typeof e?.content === 'string' && typeof e?.postedAt === 'string'
    )
    .sort(
      (a, b) =>
        new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );

  const picked: RecentBotPost[] = [];
  const seenDateStr = new Set<string>();

  for (const e of sorted) {
    if (seenDateStr.has(e.dateStr)) {
      continue;
    }
    picked.push({
      postedAt: e.postedAt,
      dateStr: e.dateStr,
      content: e.content,
    });
    seenDateStr.add(e.dateStr);
    if (picked.length >= days) {
      break;
    }
  }

  return picked.reverse(); // Oldest to newest
}

