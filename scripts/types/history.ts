/**
 * History type definitions
 */

export interface HistoryEntry {
  postedAt: string; // ISO 8601 timestamp
  dateStr: string; // YYYY/MM/DD(W) format
  content: string; // Message content
}

export interface RecentBotPost {
  postedAt: string;
  dateStr: string;
  content: string;
}

