import { config } from 'dotenv';
import fs from 'node:fs/promises';
import { postToDiscord, splitByLimit } from './post.js';

config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateInTimezoneAt(now, timeStr, timeZone) {
  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10));

  // 今日の日付を指定タイムゾーンで取得
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);

  // 指定タイムゾーンの時刻文字列を作成
  const timeStrWithTz = `${today}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;

  // タイムゾーン情報を付けてDateオブジェクトを作成
  // JSTの場合は +09:00 を付与
  const tzOffset = timeZone === 'Asia/Tokyo' ? '+09:00' : '+00:00';
  return new Date(timeStrWithTz + tzOffset);
}

function formatTime(d, tz) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(d);
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.CHANNEL_ID;
  const timeZone = process.env.TIMEZONE || 'Asia/Tokyo';
  const startJst = process.env.START_JST || '22:00';
  const intervalMinutes = parseFloat(process.env.INTERVAL_MINUTES || '3');
  const dryRun = process.env.DRY_RUN === 'true';

  if (!token || !channelId) {
    throw new Error('DISCORD_BOT_TOKEN and CHANNEL_ID must be provided');
  }

  // JSONファイル読み込み
  const filePath = process.argv[2] || 'scripts/20250909-upgrade-message.json';
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const messages = data.messages;

  console.log(`Messages loaded: ${messages.length} items`);
  console.log(`Start time: ${startJst} JST`);
  console.log(`Interval: ${intervalMinutes} minutes`);
  console.log(`Mode: ${dryRun ? 'DRY_RUN (no actual posting)' : 'LIVE (will post to Discord)'}`);

  // 開始時刻まで待機
  const now = new Date();
  const startTime = getDateInTimezoneAt(now, startJst, timeZone);

  if (now < startTime) {
    const waitMs = startTime.getTime() - now.getTime();
    console.log(`Waiting ${Math.round(waitMs / 1000)}s until ${startJst} JST...`);
    await sleep(waitMs);
  } else {
    console.log(`Start time ${startJst} JST has passed. Starting immediately.`);
  }

  // 間隔で投稿
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`\nPosting #${i + 1}/${messages.length} at ${formatTime(new Date(), timeZone)} JST`);

    if (dryRun) {
      console.log('--- DRY_RUN: Would post the following message ---');
      console.log(message);
      console.log('--- End of message ---');
    } else {
      const chunks = splitByLimit(message, 2000);
      for (const chunk of chunks) {
        await postToDiscord(channelId, chunk, token);
      }
    }

    console.log(`Posted: ${message.substring(0, 50)}...`);

    // 最後の投稿でなければ待機
    if (i < messages.length - 1) {
      const waitMs = intervalMinutes * 60_000;
      console.log(`Waiting ${intervalMinutes} minutes for next post...`);
      await sleep(waitMs);
    }
  }

  console.log('\nAll messages posted successfully!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
