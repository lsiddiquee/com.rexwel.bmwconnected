import {
  getStreamRetryDelayMs,
  STREAM_RETRY_DELAYS_MS,
  STREAM_RETRY_MAX_DELAY_MS,
  STREAM_WATCHDOG_INTERVAL_MS,
} from '../../utils/StreamRetry';

describe('StreamRetry', () => {
  it('should_followTheBackoffSchedule_when_attemptsFail', () => {
    expect([1, 2, 3, 4, 5].map(getStreamRetryDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000,
    ]);
  });

  it('should_capAt900Seconds_when_scheduleExhausted', () => {
    expect(getStreamRetryDelayMs(6)).toBe(900_000);
    expect(getStreamRetryDelayMs(7)).toBe(900_000);
    expect(getStreamRetryDelayMs(1000)).toBe(900_000);
    expect(STREAM_RETRY_MAX_DELAY_MS).toBe(900_000);
  });

  it('should_useFirstDelay_when_attemptCountIsZeroOrNegative', () => {
    expect(getStreamRetryDelayMs(0)).toBe(STREAM_RETRY_DELAYS_MS[0]);
    expect(getStreamRetryDelayMs(-3)).toBe(STREAM_RETRY_DELAYS_MS[0]);
  });

  it('should_checkTheStreamOnceAMinute_when_watchdogRuns', () => {
    expect(STREAM_WATCHDOG_INTERVAL_MS).toBe(60_000);
  });
});
