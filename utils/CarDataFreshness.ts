/**
 * Minimum time between writes of the last-update timestamp to the device store (milliseconds).
 * Streamed messages can arrive several times a second while driving; the exact time is kept in
 * memory and only persisted this often, which is plenty for minute-level freshness checks.
 */
export const LAST_DATA_UPDATE_PERSIST_INTERVAL_MS = 60 * 1000;

/**
 * Format the time of the last car data update for display, in the Homey's timezone.
 *
 * Example output: `4 Nov, 14:32`. Falls back to an ISO string when `Intl` does not support
 * the timezone or locale.
 *
 * @param epochMs - Timestamp in epoch milliseconds
 * @param timeZone - IANA timezone, e.g. `Europe/Amsterdam`
 * @returns Human readable timestamp
 */
export function formatLastUpdate(epochMs: number, timeZone: string | undefined): string {
  const date = new Date(epochMs);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Check whether car data was updated within the given number of minutes.
 *
 * @param lastUpdateMs - Stored timestamp in epoch milliseconds (anything else counts as "no timestamp")
 * @param minutes - Maximum age in minutes
 * @param now - Current time in epoch milliseconds (injectable for tests)
 * @returns True when the timestamp exists and is at most `minutes` old
 */
export function isCarDataFresh(
  lastUpdateMs: unknown,
  minutes: number,
  now: number = Date.now()
): boolean {
  if (typeof lastUpdateMs !== 'number' || !Number.isFinite(lastUpdateMs)) {
    return false;
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    return false;
  }
  return now - lastUpdateMs <= minutes * 60 * 1000;
}

/**
 * Shape of an ISO 8601 date-time (`2026-11-04T13:32:00Z`, with optional fraction and zone).
 *
 * `Date.parse` alone is too lenient: V8 accepts strings such as `"foo 1"`, which would pass for
 * a valid time of data collection.
 */
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Parse an ISO 8601 timestamp into epoch milliseconds.
 *
 * @param value - Timestamp as sent by BMW (anything that is not an ISO 8601 string is ignored)
 * @returns Epoch milliseconds, or undefined when the value is missing or cannot be parsed
 */
export function parseTimestampMs(value: unknown): number | undefined {
  if (typeof value !== 'string' || !ISO_DATE_TIME_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Find the newest valid `timestamp` among telematic data points.
 *
 * Each point's timestamp is the time the car measured the value. Points without a parseable
 * timestamp are ignored.
 *
 * @param points - Record of telematic data points (e.g. `StreamMessage.data` or the result of a REST poll)
 * @returns Epoch milliseconds of the newest point, or undefined when no point has a valid timestamp
 */
export function newestTimestampMs(points: unknown): number | undefined {
  if (typeof points !== 'object' || points === null || Array.isArray(points)) {
    return undefined;
  }

  let newest: number | undefined;
  for (const point of Object.values(points)) {
    if (typeof point !== 'object' || point === null) {
      continue;
    }
    const measuredAt = parseTimestampMs((point as { timestamp?: unknown }).timestamp);
    if (measuredAt !== undefined && (newest === undefined || measuredAt > newest)) {
      newest = measuredAt;
    }
  }
  return newest;
}

/**
 * Work out when the car measured the data it just delivered ("data time").
 *
 * Uses the newest valid point timestamp, then the fallback timestamp (the message time of an
 * MQTT message), then `now`. The result is never in the future: BMW and Homey clocks can differ.
 * A replayed MQTT message or a REST poll with hours-old values therefore yields an old data
 * time instead of looking fresh.
 *
 * @param points - Record of telematic data points
 * @param fallbackTimestamp - Used when no point has a valid timestamp (e.g. `StreamMessage.timestamp`)
 * @param now - Current time in epoch milliseconds (injectable for tests)
 * @returns Data time in epoch milliseconds, at most `now`
 */
export function resolveCarDataTimeMs(
  points: unknown,
  fallbackTimestamp?: unknown,
  now: number = Date.now()
): number {
  const measuredAt = newestTimestampMs(points) ?? parseTimestampMs(fallbackTimestamp) ?? now;
  return Math.min(measuredAt, now);
}
