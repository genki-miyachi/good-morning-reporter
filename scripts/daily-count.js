import { config } from 'dotenv';
import { generateMessage } from './gemini-client.js';
import { buildPrompt } from './prompt.js';

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

function snowflakeToTimestampMs(snowflake) {
  try {
    const id = BigInt(snowflake);
    return Number((id >> 22n) + BigInt(DISCORD_EPOCH));
  } catch {
    return 0;
  }
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

async function getAllMessages(channelId, startSnowflake, token, endTimestampMs) {
  const allMessages = [];
  let afterSnowflake = startSnowflake;
  let pageCount = 0;

  while (true) {
    const messages = await fetchMessages(channelId, afterSnowflake, token);

    if (messages.length === 0) {
      break;
    }

    if (typeof endTimestampMs === 'number') {
      // 範囲内(<= end)のみ取り込み、越えたら打ち切り
      const within = [];
      for (const m of messages) {
        const ts = snowflakeToTimestampMs(m.id);
        if (ts <= endTimestampMs) {
          within.push(m);
        } else {
          // 以降は昇順でより新しいはずなので無視
          break;
        }
      }
      allMessages.push(...within);

      // このページで打ち切った場合は終了
      if (within.length < messages.length) {
        pageCount++;
        break;
      }
    } else {
      allMessages.push(...messages);
    }
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

// 生成されたメッセージに必ず「{count}人」を含める
function enforceCountInText(text, count) {
  const mustInclude = `${count}人`;
  if (typeof text === 'string' && !text.includes(mustInclude)) {
    return `${text}\n${mustInclude}`;
  }
  return text;
}

async function createGeminiMessage(date, count, timezone, messages = []) {
  try {
    // console.log(`messages: ${JSON.stringify(messages, null, 2)}`);
    const dateStr = formatDateString(date, timezone);
    const prompt = buildPrompt({ dateStr, count, messages });
    // console.log(`prompt: ${prompt}`);
    let message = await generateMessage(prompt);
    // 必ず人数表現を含める（AI出力の揺れ対策）
    message = enforceCountInText(message, count);

    // Discord制限チェック
    if (message.length > 2000) {
      console.warn('Generated message too long, falling back to default');
      return createResultMessage(date, count, timezone);
    }

    return message;
  } catch (error) {
    console.warn('Gemini API failed, falling back to default message:', error.message);
    return createResultMessage(date, count, timezone);
  }
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
    // 当日 04:00〜翌日 00:00(ローカル) - 1ms を UTC に換算
    const rangeStartUtc = new Date(startOfDay.getTime() + 4 * 60 * 60 * 1000);
    const startOfNextLocalDayUtc = getStartOfDayUTC(new Date(startOfDay.getTime() + 36 * 60 * 60 * 1000), timezone);
    const rangeEndUtc = new Date(startOfNextLocalDayUtc.getTime() - 1);
    const startSnowflake = timestampToSnowflake(rangeStartUtc.getTime());

    console.log(
      `Counting messages from ${rangeStartUtc.toISOString()} to ${rangeEndUtc.toISOString()} (${formatDateString(startOfDay, timezone)})`
    );
    console.log(`Start snowflake: ${startSnowflake}`);

    const messages = await getAllMessages(channelId, startSnowflake, token, rangeEndUtc.getTime());
    const count = countUniqueAuthors(messages, { excludeBots, excludeUserIds });

    console.log(`Total message count: ${count}`);
    // console.log(`Raw messages fetched: ${messages.length}`);

    const resultMessage = await createGeminiMessage(startOfDay, count, timezone, messages);

    const dryRun = process.env.DRY_RUN === 'true';
    if (dryRun) {
      console.log('DRY_RUN mode: Would post the following message:');
      console.log('---');
      console.log(resultMessage);
      console.log('---');
    } else {
      console.log(`Posting result message: ${resultMessage}`);
      await postResult(channelId, resultMessage, token);
      console.log('Result posted successfully');
    }

    if (!dryRun) {

    }


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
  createResultMessage,
  createGeminiMessage
};
