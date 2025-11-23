/**
 * Message generation service
 */

import { generateMessage } from '../gemini-client.js';
import { buildPrompt } from '../prompt.js';
import { formatDateString } from '../utils/timezone.js';
import { pickRecentBotPosts } from './history-manager.js';
import { HistoryEntry } from '../types/history.js';
import { DiscordMessage } from '../types/discord.js';
import { Config } from '../config/types.js';
import { withRetry } from '../utils/retry.js';
import { warn } from '../utils/logger.js';

const GREETING_PATTERNS = [
  '今日も一日みんな頑張ったね！',
  'やあみんな！今日も頑張って起きれたかな？',
  'おはよう！みんなの Good Morning を数えてきたよ！',
  'よっしゃ！今日の Good Morning カウント結果だ！',
  'みんなー！今日も元気だったね！',
  'おつかれさま！今日の Good Morning はこんな感じだったよ！',
  'はいはい！Good Morning カウントの時間だよ〜！',
  'よし！みんなの頑張りを発表するぞ！',
  '今日もいい一日だったね！GM の結果はこちら！',
  'みなさんお疲れ様！今日の GM 報告です！',
  'いえーい！今日の GM カウント完了だよ！',
];

const END_PATTERNS = [
  '今日も一日お疲れ様！',
  'みんな今日もありがとう！',
  'また明日も頑張ろうね！',
  'おやすみなさい〜！',
  '明日もよろしくお願いします！',
  'ゆっくり休んでね！',
  '今日もいい一日だったね！',
  'また明日もよろしく！',
  'お疲れ様でした〜！',
  'みんなお疲れ！',
  '明日も起きたいと思えるような素敵な朝を迎えられますように🌞',
];

/**
 * Generate a default result message
 */
function createResultMessage(date: Date, count: number, timezone: string): string {
  const dateStr = formatDateString(date, timezone);
  const greeting =
    GREETING_PATTERNS[Math.floor(Math.random() * GREETING_PATTERNS.length)];
  const ending = END_PATTERNS[Math.floor(Math.random() * END_PATTERNS.length)];

  return `${greeting}\n${dateStr} の目覚め人は ${count}人 だね！\n${ending}`;
}

/**
 * Enforce count in text (fallback for AI output)
 */
function enforceCountInText(text: string, count: number): string {
  const mustInclude = `${count}人`;
  if (!text.includes(mustInclude)) {
    return `${text}\n${mustInclude}`;
  }
  return text;
}

/**
 * Generate message with retry using Gemini API
 */
async function generateMessageWithRetry(
  prompt: string,
  config: Config
): Promise<string> {
  return withRetry(
    async () => {
      return await generateMessage(prompt, {
        timeoutMs: config.gemini.timeoutMs,
      });
    },
    {
      maxAttempts: config.gemini.retryMax,
      baseDelayMs: config.gemini.retryBaseMs,
      maxDelayMs: config.gemini.retryMaxMs,
      isRetryable: (error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          return status === 429 || (status >= 500 && status < 600);
        }
        return false;
      },
    }
  );
}

/**
 * Create Gemini message
 */
async function createGeminiMessage(
  date: Date,
  count: number,
  timezone: string,
  config: Config,
  messages: DiscordMessage[] = [],
  recentBotPosts: HistoryEntry[] = []
): Promise<string> {
  try {
    const dateStr = formatDateString(date, timezone);
    const prompt = buildPrompt({ dateStr, count, messages, recentBotPosts });
    let message = await generateMessageWithRetry(prompt, config);
    message = enforceCountInText(message, count);

    // Discord limit check
    if (message.length > config.discord.messageLimit) {
      warn('Generated message too long, falling back to default', {
        length: message.length,
        limit: config.discord.messageLimit,
      });
      return createResultMessage(date, count, timezone);
    }

    return message;
  } catch (error) {
    warn('Gemini API failed, falling back to default message', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createResultMessage(date, count, timezone);
  }
}

/**
 * Generate daily message
 */
export async function generateDailyMessage(
  date: Date,
  count: number,
  config: Config,
  messages: DiscordMessage[],
  history: HistoryEntry[]
): Promise<string> {
  const recentBotPosts = pickRecentBotPosts(history, {
    days: config.history.daysForPrompt,
    now: new Date(),
  });

  return createGeminiMessage(
    date,
    count,
    config.timezone,
    config,
    messages,
    recentBotPosts
  );
}

