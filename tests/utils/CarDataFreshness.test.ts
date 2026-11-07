import {
  formatLastUpdate,
  newestTimestampMs,
  parseTimestampMs,
  resolveCarDataTimeMs,
} from '../../utils/CarDataFreshness';

describe('CarDataFreshness', () => {
  describe('formatLastUpdate', () => {
    it('should_formatInTheGivenTimezone', () => {
      const epoch = Date.parse('2026-11-04T13:32:00Z');

      expect(formatLastUpdate(epoch, 'Europe/Amsterdam')).toBe('4 Nov, 14:32');
      expect(formatLastUpdate(epoch, 'UTC')).toBe('4 Nov, 13:32');
      expect(formatLastUpdate(epoch, 'America/New_York')).toBe('4 Nov, 08:32');
    });

    it('should_rollOverTheDate_when_timezoneIsAheadOfUtc', () => {
      const epoch = Date.parse('2026-11-04T23:05:00Z');

      expect(formatLastUpdate(epoch, 'Europe/Amsterdam')).toBe('5 Nov, 00:05');
    });

    it('should_fallBackToIsoString_when_timezoneIsInvalid', () => {
      const epoch = Date.parse('2026-11-04T13:32:00Z');

      expect(formatLastUpdate(epoch, 'Not/AZone')).toBe('2026-11-04T13:32:00.000Z');
    });
  });

  describe('parseTimestampMs', () => {
    it('should_parseIsoTimestamps_when_valid', () => {
      expect(parseTimestampMs('2026-11-04T13:32:00Z')).toBe(Date.parse('2026-11-04T13:32:00Z'));
      expect(parseTimestampMs('2026-11-04T13:32:00.5Z')).toBe(
        Date.parse('2026-11-04T13:32:00.500Z')
      );
      expect(parseTimestampMs('2026-11-04T14:32:00+01:00')).toBe(
        Date.parse('2026-11-04T13:32:00Z')
      );
    });

    it('should_returnUndefined_when_notAnIsoTimestamp', () => {
      expect(parseTimestampMs('garbage')).toBeUndefined();
      expect(parseTimestampMs('foo 1')).toBeUndefined();
      expect(parseTimestampMs('1')).toBeUndefined();
      expect(parseTimestampMs('')).toBeUndefined();
      expect(parseTimestampMs('2026-13-45T99:99:99Z')).toBeUndefined();
    });

    it('should_returnUndefined_when_notAString', () => {
      expect(parseTimestampMs(undefined)).toBeUndefined();
      expect(parseTimestampMs(null)).toBeUndefined();
      expect(parseTimestampMs(1762263120000)).toBeUndefined();
      expect(parseTimestampMs({})).toBeUndefined();
    });
  });

  describe('newestTimestampMs', () => {
    it('should_returnNewestValidTimestamp_when_pointsHaveTimestamps', () => {
      const points = {
        a: { timestamp: '2026-11-04T10:00:00Z', value: 1 },
        b: { timestamp: '2026-11-04T12:30:00Z', value: 2 },
        c: { timestamp: '2026-11-04T11:00:00Z', value: 3 },
      };

      expect(newestTimestampMs(points)).toBe(Date.parse('2026-11-04T12:30:00Z'));
    });

    it('should_skipInvalidTimestamps_when_pickingNewest', () => {
      const points = {
        a: { timestamp: 'garbage', value: 1 },
        b: { timestamp: '2026-11-04T09:00:00Z', value: 2 },
        c: { value: 3 },
        d: null,
        e: 'not a point',
        f: { timestamp: 42, value: 4 },
      };

      expect(newestTimestampMs(points)).toBe(Date.parse('2026-11-04T09:00:00Z'));
    });

    it('should_returnUndefined_when_noPointHasAValidTimestamp', () => {
      expect(newestTimestampMs({})).toBeUndefined();
      expect(newestTimestampMs({ a: { timestamp: 'nope' } })).toBeUndefined();
      expect(newestTimestampMs(undefined)).toBeUndefined();
      expect(newestTimestampMs(null)).toBeUndefined();
      expect(newestTimestampMs('x')).toBeUndefined();
      expect(newestTimestampMs([{ timestamp: '2026-11-04T09:00:00Z' }])).toBeUndefined();
    });
  });

  describe('resolveCarDataTimeMs', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const points = (...timestamps: string[]) =>
      Object.fromEntries(timestamps.map((timestamp, i) => [`key${i}`, { timestamp, value: i }]));

    it('should_useNewestPointTimestamp_when_available', () => {
      const result = resolveCarDataTimeMs(
        points('2026-11-04T10:00:00Z', '2026-11-04T11:15:00Z'),
        '2026-11-04T11:59:00Z',
        now
      );

      expect(result).toBe(Date.parse('2026-11-04T11:15:00Z'));
    });

    it('should_useFallbackTimestamp_when_noPointTimestampIsValid', () => {
      expect(resolveCarDataTimeMs(points('garbage'), '2026-11-04T11:30:00Z', now)).toBe(
        Date.parse('2026-11-04T11:30:00Z')
      );
      expect(resolveCarDataTimeMs({}, '2026-11-04T11:30:00Z', now)).toBe(
        Date.parse('2026-11-04T11:30:00Z')
      );
    });

    it('should_useNow_when_nothingIsValid', () => {
      expect(resolveCarDataTimeMs(points('garbage'), 'also garbage', now)).toBe(now);
      expect(resolveCarDataTimeMs({}, undefined, now)).toBe(now);
      expect(resolveCarDataTimeMs(undefined, undefined, now)).toBe(now);
    });

    it('should_clampToNow_when_timestampIsInTheFuture', () => {
      expect(resolveCarDataTimeMs(points('2026-11-04T12:30:00Z'), undefined, now)).toBe(now);
      expect(resolveCarDataTimeMs({}, '2026-11-05T00:00:00Z', now)).toBe(now);
    });

    it('should_useCurrentTime_when_nowNotProvided', () => {
      const before = Date.now();
      const result = resolveCarDataTimeMs({}, undefined);
      const after = Date.now();

      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });
});
