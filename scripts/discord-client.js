const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_EPOCH = 1420070400000;

export function timestampToSnowflake(timestampMs) {
  return ((BigInt(timestampMs) - BigInt(DISCORD_EPOCH)) << 22n).toString();
}

export function snowflakeToTimestampMs(snowflake) {
  try {
    const id = BigInt(snowflake);
    return Number((id >> 22n) + BigInt(DISCORD_EPOCH));
  } catch {
    return 0;
  }
}

export async function fetchMessages(channelId, afterSnowflake, token) {
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

export async function getAllMessages(channelId, startSnowflake, token, endTimestampMs) {
  const allMessages = [];
  let afterSnowflake = startSnowflake;
  let pageCount = 0;

  while (true) {
    const messages = await fetchMessages(channelId, afterSnowflake, token);

    if (messages.length === 0) {
      break;
    }

    if (typeof endTimestampMs === 'number') {
      const within = [];
      for (const m of messages) {
        const ts = snowflakeToTimestampMs(m.id);
        if (ts <= endTimestampMs) {
          within.push(m);
        } else {
          break;
        }
      }
      allMessages.push(...within);

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

export async function postResult(channelId, content, token) {
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



