/**
 * Timezone utilities
 */

export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Get the start of day in UTC for a given timezone
 * @param now - Current date/time
 * @param timezone - Timezone string (e.g., 'Asia/Tokyo')
 * @returns Start of day in UTC
 */
export function getStartOfDayUTC(now: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const dateStr = formatter.format(now);
  const startOfDayInTimezone = new Date(`${dateStr}T00:00:00`);

  const utcDate = new Date(startOfDayInTimezone.getTime());
  const localDate = new Date(startOfDayInTimezone.toLocaleString('en-US', { timeZone: timezone }));
  const timezoneOffsetMs = utcDate.getTime() - localDate.getTime();

  return new Date(startOfDayInTimezone.getTime() + timezoneOffsetMs);
}

/**
 * Get time range for daily message counting (04:00 to next day 00:00)
 * @param now - Current date/time
 * @param timezone - Timezone string (e.g., 'Asia/Tokyo')
 * @returns Time range in UTC
 */
export function getTimeRangeUTC(now: Date, timezone: string): TimeRange {
  const startOfDay = getStartOfDayUTC(now, timezone);
  // 当日 04:00〜翌日 00:00(ローカル) - 1ms を UTC に換算
  const rangeStartUtc = new Date(startOfDay.getTime() + 4 * 60 * 60 * 1000);
  const startOfNextLocalDayUtc = getStartOfDayUTC(
    new Date(startOfDay.getTime() + 36 * 60 * 60 * 1000),
    timezone
  );
  const rangeEndUtc = new Date(startOfNextLocalDayUtc.getTime() - 1);

  return {
    start: rangeStartUtc,
    end: rangeEndUtc,
  };
}

/**
 * Format date string for display
 * @param date - Date to format
 * @param timezone - Timezone string (e.g., 'Asia/Tokyo')
 * @returns Formatted date string (YYYY/MM/DD(W))
 */
export function formatDateString(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';

  return `${year}/${month}/${day}(${weekday})`;
}

