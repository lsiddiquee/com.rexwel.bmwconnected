/**
 * Delays between attempts to start the MQTT stream after a failed start, in milliseconds.
 * The first retry waits 30 s, then the delay doubles: 30 s, 60 s, 120 s, 240 s, 480 s.
 */
export const STREAM_RETRY_DELAYS_MS: readonly number[] = [
  30 * 1000,
  60 * 1000,
  120 * 1000,
  240 * 1000,
  480 * 1000,
];

/**
 * Delay used for every retry after the backoff schedule is exhausted (15 minutes).
 */
export const STREAM_RETRY_MAX_DELAY_MS = 900 * 1000;

/**
 * Get the delay before the next stream start attempt.
 *
 * @param failedAttempts - Number of consecutive failed start attempts so far (1 for the first failure)
 * @returns Delay in milliseconds before the next attempt
 */
export function getStreamRetryDelayMs(failedAttempts: number): number {
  const index = Math.max(0, Math.floor(failedAttempts) - 1);
  return STREAM_RETRY_DELAYS_MS[index] ?? STREAM_RETRY_MAX_DELAY_MS;
}

/**
 * How often the stream watchdog checks that the MQTT stream is still running (1 minute).
 */
export const STREAM_WATCHDOG_INTERVAL_MS = 60 * 1000;
