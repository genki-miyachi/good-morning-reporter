import { config } from 'dotenv';

config();

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_EPOCH = 1420070400000;

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
  'いえーい！今日の GM カウント完了だよ！'
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
  '明日も起きたいと思えるような素敵な朝を迎えられますように🌞'
];

function getStartOfDayUTC(now, timezone) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const dateStr = formatter.format(now);

  const startOfDayInTimezone = new Date(`${dateStr}T00:00:00`);

  const utcDate = new Date(startOfDayInTimezone.getTime());
  const localDate = new Date(startOfDayInTimezone.toLocaleString('en-US', { timeZone: timezone }));
  const timezoneOffsetMs = utcDate.getTime() - localDate.getTime();

  return new Date(startOfDayInTimezone.getTime() + timezoneOffsetMs);
}

function timestampToSnowflake(timestampMs) {
  return ((BigInt(timestampMs) - BigInt(DISCORD_EPOCH)) << 22n).toString();
}

async function fetchMessages(channelId, afterSnowflake, token) {
  const url = new URL(`${DISCORD_API_BASE}/channels/${channelId}/messages`);
  url.searchParams.set('limit', '100');
  if (afterSnowflake) {
    url.searchParams.set('after', afterSnowflake);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bot ${token}`,
      'User-Agent': 'Discord-GM-Counter/1.0'
    }
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
    const waitTime = Math.min(retryAfter * 1000, 60000);
    console.log(`Rate limited. Waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return fetchMessages(channelId, afterSnowflake, token);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function getAllMessages(channelId, startSnowflake, token) {
  const allMessages = [];
  let afterSnowflake = startSnowflake;
  let pageCount = 0;

  while (true) {
    const messages = await fetchMessages(channelId, afterSnowflake, token);

    if (messages.length === 0) {
      break;
    }

    allMessages.push(...messages);
    pageCount++;

    afterSnowflake = messages[messages.length - 1].id;

    if (messages.length < 100) {
      break;
    }
  }

  console.log(`Fetched ${allMessages.length} messages across ${pageCount} pages`);
  return allMessages;　　 　
}

function countMessages(messages, filters = {}) {
  const { excludeBots = false, excludeUserIds = [] } = filters;

  return messages.filter(message => {
    if (excludeBots && message.author.bot) {
      return false;
    }

    if (excludeUserIds.includes(message.author.id)) {
      return false;
    }

    return true;
  }).length;
}

function countUniqueAuthors(messages, filters = {}) {
  const { excludeBots = false, excludeUserIds = [] } = filters;

  const uniqueAuthorIds = new Set();

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

async function postResult(channelId, content, token) {
  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Discord-GM-Counter/1.0'
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post message: ${response.status} ${errorText}`);
  }

  return response.json();
}

function formatDateString(date, timezone) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const weekday = parts.find(p => p.type === 'weekday').value;

  return `${year}/${month}/${day}(${weekday})`;
}

function createResultMessage(date, count, timezone) {
  const dateStr = formatDateString(date, timezone);
  const greeting = GREETING_PATTERNS[Math.floor(Math.random() * GREETING_PATTERNS.length)];
  const ending = END_PATTERNS[Math.floor(Math.random() * END_PATTERNS.length)];

  return `${greeting}\n${dateStr} の目覚め人は ${count}人 だね！\n${ending}`;
}

async function main() {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.CHANNEL_ID;
    const timezone = process.env.TIMEZONE || 'Asia/Tokyo';
    const excludeBots = process.env.EXCLUDE_BOTS === 'true';
    const excludeUserIds = process.env.EXCLUDE_USER_IDS
      ? process.env.EXCLUDE_USER_IDS.split(',').map(id => id.trim()).filter(id => id)
      : [];

    if (!token || !channelId) {
      throw new Error('DISCORD_BOT_TOKEN and CHANNEL_ID must be provided');
    }

    const now = new Date();
    const startOfDay = getStartOfDayUTC(now, timezone);
    const startSnowflake = timestampToSnowflake(startOfDay.getTime());

    console.log(`Counting messages from ${startOfDay.toISOString()} (${formatDateString(startOfDay, timezone)})`);
    console.log(`Start snowflake: ${startSnowflake}`);

    const messages = await getAllMessages(channelId, startSnowflake, token);
    const count = countUniqueAuthors(messages, { excludeBots, excludeUserIds });

    console.log(`Total message count: ${count}`);

    const resultMessage = createResultMessage(startOfDay, count, timezone);
    await postResult(channelId, resultMessage, token);

    console.log('Result posted successfully');
    console.log(`Posted message: ${resultMessage}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  getStartOfDayUTC,
  timestampToSnowflake,
  fetchMessages,
  getAllMessages,
  countMessages,
  countUniqueAuthors,
  postResult,
  formatDateString,
  createResultMessage
};
