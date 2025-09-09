import { config } from 'dotenv';

config();

const DISCORD_API_BASE = 'https://discord.com/api/v10';

async function postToDiscord(channelId, content, token) {
  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Discord-GM-Counter/1.0'
    },
    body: JSON.stringify({ content })
  });

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseFloat(retryAfterHeader) : 1;
    const waitTime = Math.min(retryAfter * 1000, 60000);
    console.log(`Rate limited. Waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return postToDiscord(channelId, content, token);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post message: ${response.status} ${errorText}`);
  }

  return response.json();
}

function splitByLimit(text, limit = 2000) {
  if (text.length <= limit) return [text];
  const parts = [];
  let start = 0;
  while (start < text.length) {
    parts.push(text.slice(start, start + limit));
    start += limit;
  }
  return parts;
}

async function main() {
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
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  postToDiscord,
  splitByLimit
};



