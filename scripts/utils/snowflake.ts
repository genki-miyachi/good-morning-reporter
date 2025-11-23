/**
 * Discord Snowflake ID utilities
 *
 * Discord uses Snowflake IDs which are 64-bit integers that contain:
 * - Timestamp (milliseconds since Discord epoch)
 * - Internal worker ID
 * - Internal process ID
 * - Increment
 *
 * Reference: https://discord.com/developers/docs/reference#snowflakes
 */

export const DISCORD_EPOCH = 1420070400000;

/**
 * Convert a timestamp (milliseconds) to a Discord Snowflake ID
 * @param timestampMs - Timestamp in milliseconds
 * @returns Snowflake ID as string
 */
export function timestampToSnowflake(timestampMs: number): string {
  return ((BigInt(timestampMs) - BigInt(DISCORD_EPOCH)) << 22n).toString();
}

/**
 * Convert a Discord Snowflake ID to a timestamp (milliseconds)
 * @param snowflake - Snowflake ID as string
 * @returns Timestamp in milliseconds, or 0 if invalid
 */
export function snowflakeToTimestampMs(snowflake: string): number {
  try {
    const id = BigInt(snowflake);
    return Number((id >> 22n) + BigInt(DISCORD_EPOCH));
  } catch {
    return 0;
  }
}

