import { fetchMessages } from '../discord-client.js';
import { info, warn } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import { DiscordChannel } from './types.js';
import { DiscordMessage } from '../types/discord.js';

/**
 * チャンネルごとに差分メッセージを取得し、DB に保存する
 */
export async function fetchAndStoreMessages(
  channels: DiscordChannel[],
  token: string,
): Promise<DiscordMessage[]> {
  const allNewMessages: DiscordMessage[] = [];

  for (const channel of channels) {
    const messages = await fetchChannelMessages(channel, token);
    if (messages.length > 0) {
      await insertMessages(messages);
      await updateLastFetchedMessageId(
        channel.id,
        messages[0].id, // messages は新しい順で返ってくる
      );
      allNewMessages.push(...messages);
    }
  }

  info('Fetched and stored messages from all channels', {
    totalMessages: allNewMessages.length,
    channels: channels.length,
  });

  return allNewMessages;
}

/**
 * 1チャンネルから差分メッセージを取得（last_fetched_message_id 以降）
 */
async function fetchChannelMessages(
  channel: DiscordChannel,
  token: string,
): Promise<DiscordMessage[]> {
  // DB から last_fetched_message_id を取得
  const { data: channelRow } = await supabase
    .from('channels')
    .select('last_fetched_message_id::text')
    .eq('id', channel.id)
    .single();

  const afterSnowflake = channelRow?.last_fetched_message_id ?? null;

  // ページングで全メッセージを取得
  const allMessages: DiscordMessage[] = [];
  let currentAfter = afterSnowflake;

  while (true) {
    const messages = await fetchMessages(channel.id, currentAfter, token);
    if (messages.length === 0) break;

    allMessages.push(...messages);
    currentAfter = messages[messages.length - 1].id;

    if (messages.length < 100) break;
  }

  if (allMessages.length > 0) {
    info('Fetched messages from channel', {
      channel: channel.name,
      count: allMessages.length,
    });
  }

  return allMessages;
}

/**
 * メッセージを messages テーブルに INSERT（重複は無視）
 */
async function insertMessages(messages: DiscordMessage[]): Promise<void> {
  const rows = messages.map((msg) => ({
    id: msg.id,
    channel_id: msg.channel_id,
    author_id: msg.author.id,
    author_name: msg.author.global_name || msg.author.username,
    content: msg.content || '',
    created_at: msg.timestamp,
    reaction_count: msg.reactions
      ? msg.reactions.reduce((sum, r) => sum + r.count, 0)
      : 0,
    reply_to_message_id: getReplyToMessageId(msg)?.toString(),
    fetched_at: new Date().toISOString(),
  }));

  // Supabase の upsert はバッチで実行可能（1000件まで）
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('messages')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

    if (error) {
      warn('Failed to insert messages batch', { error, batchIndex: i });
    }
  }
}

/**
 * Discord メッセージから返信先の message_id を取得
 */
function getReplyToMessageId(msg: DiscordMessage): string | null {
  const ref = (msg as DiscordMessageWithRef).message_reference;
  return ref?.message_id ?? null;
}

/** Discord API のメッセージには message_reference がある場合がある */
interface DiscordMessageWithRef extends DiscordMessage {
  message_reference?: {
    message_id?: string;
    channel_id?: string;
    guild_id?: string;
  };
}

/**
 * channels テーブルの last_fetched_message_id を更新
 */
async function updateLastFetchedMessageId(
  channelId: string,
  latestMessageId: string,
): Promise<void> {
  const { error } = await supabase
    .from('channels')
    .update({
      last_fetched_message_id: latestMessageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', channelId);

  if (error) {
    warn('Failed to update last_fetched_message_id', {
      channelId,
      error,
    });
  }
}
