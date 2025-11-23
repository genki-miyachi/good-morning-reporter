/**
 * Daily count main script
 */

import { getConfig } from './config/index.js';
import { fetchDailyMessages } from './services/message-fetcher.js';
import { countUniqueAuthors } from './services/message-counter.js';
import { loadHistory, saveHistory } from './services/history-manager.js';
import { generateDailyMessage } from './services/message-generator.js';
import { postResult } from './discord-client.js';
import { getStartOfDayUTC, formatDateString } from './utils/timezone.js';
import { info, error as logError } from './utils/logger.js';
import { HistoryEntry } from './types/history.js';

async function main(): Promise<void> {
  try {
    const config = getConfig();
    const now = new Date();
    const startOfDay = getStartOfDayUTC(now, config.timezone);
    const todayDateStr = formatDateString(startOfDay, config.timezone);

    info('Starting daily count', {
      dateStr: todayDateStr,
      timezone: config.timezone,
    });

    // Fetch messages
    const messages = await fetchDailyMessages(config);
    const count = countUniqueAuthors(messages, {
      excludeBots: config.filters.excludeBots,
      excludeUserIds: config.filters.excludeUserIds,
    });

    info('Message count completed', {
      count,
      totalMessages: messages.length,
    });

    // Load history and generate message
    const history = await loadHistory(config.historyFile);
    const recentBotPosts = history.filter((e) => e.dateStr !== todayDateStr);

    const resultMessage = await generateDailyMessage(
      startOfDay,
      count,
      config,
      messages,
      recentBotPosts
    );

    // Post or dry run
    if (config.dryRun) {
      info('DRY_RUN mode: Would post the following message', {
        message: resultMessage,
      });
      console.log('---');
      console.log(resultMessage);
      console.log('---');
    } else {
      info('Posting result message');
      await postResult(config.discord.channelId, resultMessage, config.discord.botToken);
      info('Result posted successfully');

      // Update history
      const updated: HistoryEntry[] = history.concat({
        postedAt: new Date().toISOString(),
        dateStr: todayDateStr,
        content: resultMessage,
      });
      await saveHistory(config.historyFile, updated, config.history.maxItems);
    }
  } catch (err) {
    logError('Error in main', err);
    process.exit(1);
  }
}

// Check if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]);

if (isMainModule) {
  main();
}

// Export for backward compatibility with tests
export {
  getStartOfDayUTC,
  formatDateString,
} from './utils/timezone.js';
export { timestampToSnowflake } from './utils/snowflake.js';
export { countMessages, countUniqueAuthors } from './services/message-counter.js';
export { postResult, getAllMessages, fetchMessages } from './discord-client.js';
export { generateDailyMessage } from './services/message-generator.js';

