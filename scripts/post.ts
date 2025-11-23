/**
 * Manual post script
 */

import { config } from 'dotenv';
import { postResult as postToDiscord } from './discord-client.js';

config();

// Re-export for backward compatibility
export { postToDiscord as postResult };

function splitByLimit(text: string, limit: number = 2000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    parts.push(text.slice(start, start + limit));
    start += limit;
  }
  return parts;
}

async function main(): Promise<void> {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.CHANNEL_ID;

    if (!token || !channelId) {
      throw new Error('DISCORD_BOT_TOKEN and CHANNEL_ID must be provided');
    }

    const message = process.argv.slice(2).join(' ').trim();

    if (!message) {
      console.error('Usage: npm run post -- "<message>"');
      process.exit(1);
    }

    const chunks = splitByLimit(message, 2000);
    for (const chunk of chunks) {
      await postToDiscord(channelId, chunk, token);
    }

    console.log('Message posted successfully');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { splitByLimit };

