/**
 * Comprehensive Unit Tests for RateLimiter
 *
 * Tests rate limiting implementation to improve coverage from 5.55% to 80%+:
 * - Constructor and configuration
 * - Request checking and limiting
 * - Request recording and tracking
 * - Sliding window algorithm
 * - Per-identifier rate limiting
 * - Time-based cleanup and reset
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { RateLimiter, type RateLimitConfig } from '../../../lib/http/RateLimiter';
import { RateLimitError } from '../../../lib/types/errors';

describe('RateLimiter - Comprehensive Tests', () => {
  let rateLimiter: RateLimiter;
  let config: RateLimitConfig;
  let mockDateNow: jest.SpiedFunction<typeof Date.now>;

  beforeEach(() => {
    // Default rate limit config (similar to BMW CarData API)
    config = {
      maxRequests: 50,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
    };

    // Mock Date.now for predictable time-based testing
    mockDateNow = jest.spyOn(Date, 'now');
    mockDateNow.mockReturnValue(1640995200000); // Fixed timestamp: 2022-01-01 00:00:00 UTC
  });

  afterEach(() => {
    mockDateNow.mockRestore();
  });

  describe('Constructor & Configuration', () => {
    it('should_createRateLimiter_when_configProvided', () => {
      // Act
      const limiter = new RateLimiter(config);

      // Assert
      expect(limiter).toBeDefined();
      expect(limiter.getRequestCount()).toBe(0);
    });

    it('should_acceptCustomConfig_when_differentLimitsProvided', () => {
      // Arrange
      const customConfig: RateLimitConfig = {
        maxRequests: 100,
        windowMs: 60 * 60 * 1000, // 1 hour
      };

      // Act
      const limiter = new RateLimiter(customConfig);

      // Assert
      expect(limiter).toBeDefined();
      expect(limiter.getRequestCount()).toBe(0);
    });

    it('should_handleSmallLimits_when_restrictiveConfig', () => {
      // Arrange
      const restrictiveConfig: RateLimitConfig = {
        maxRequests: 1,
        windowMs: 1000, // 1 second
      };

      // Act
      const limiter = new RateLimiter(restrictiveConfig);

      // Assert
      expect(limiter).toBeDefined();
    });
  });

  describe('Request Checking & Limiting', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(config);
    });

    it('should_allowRequest_when_underLimit', () => {
      // Act & Assert
      expect(() => rateLimiter.checkLimit()).not.toThrow();
      expect(() => rateLimiter.checkLimit('vehicle-123')).not.toThrow();
    });

    it('should_allowMultipleRequests_when_underLimit', () => {
      // Arrange
      for (let i = 0; i < 49; i++) {
        rateLimiter.recordRequest();
      }

      // Act & Assert
      expect(() => rateLimiter.checkLimit()).not.toThrow();
      expect(rateLimiter.getRequestCount()).toBe(49);
    });

    it('should_throwRateLimitError_when_atMaxRequests', () => {
      // Arrange
      for (let i = 0; i < 50; i++) {
        rateLimiter.recordRequest();
      }

      // Act & Assert
      expect(() => rateLimiter.checkLimit()).toThrow(RateLimitError);
      expect(() => rateLimiter.checkLimit()).toThrow('Rate limit exceeded');
    });

    it('should_calculateRetryAfter_when_rateLimitExceeded', () => {
      // Arrange
      const startTime = 1640995200000; // 2022-01-01 00:00:00
      mockDateNow.mockReturnValue(startTime);

      rateLimiter.recordRequest(); // First request at startTime

      // Fill up the rest of the requests
      for (let i = 1; i < 50; i++) {
        rateLimiter.recordRequest();
      }

      // Move forward 1 hour
      const currentTime = startTime + 60 * 60 * 1000;
      mockDateNow.mockReturnValue(currentTime);

      // Act & Assert
      expect(() => rateLimiter.checkLimit()).toThrow(RateLimitError);

      try {
        rateLimiter.checkLimit();
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        // RateLimitError has retryAfter property (number), not retryAfterSeconds
        expect(rateLimitError.retryAfter).toBe(82800); // 23 hours remaining in seconds
      }
    });

    it('should_allowRequestAgain_when_windowExpires', () => {
      // Arrange
      const startTime = 1640995200000;
      mockDateNow.mockReturnValue(startTime);

      // Fill up requests at start time
      for (let i = 0; i < 50; i++) {
        rateLimiter.recordRequest();
      }

      // Verify rate limit is hit
      expect(() => rateLimiter.checkLimit()).toThrow(RateLimitError);

      // Move forward past the window (24 hours + 1 second)
      const futureTime = startTime + 24 * 60 * 60 * 1000 + 1000;
      mockDateNow.mockReturnValue(futureTime);

      // Act & Assert
      expect(() => rateLimiter.checkLimit()).not.toThrow();
      expect(rateLimiter.getRequestCount()).toBe(0);
    });
  });

  describe('Per-Identifier Rate Limiting', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(config);
    });

    it('should_trackSeparately_when_differentIdentifiers', () => {
      // Arrange
      for (let i = 0; i < 30; i++) {
        rateLimiter.recordRequest('vehicle-123');
      }
      for (let i = 0; i < 25; i++) {
        rateLimiter.recordRequest('vehicle-456');
      }

      // Act & Assert
      expect(() => rateLimiter.checkLimit('vehicle-123')).not.toThrow();
      expect(() => rateLimiter.checkLimit('vehicle-456')).not.toThrow();
      expect(rateLimiter.getRequestCount('vehicle-123')).toBe(30);
      expect(rateLimiter.getRequestCount('vehicle-456')).toBe(25);
      expect(rateLimiter.getRequestCount()).toBe(55); // Total
    });

    it('should_enforceLimitPerIdentifier_when_identifierSpecific', () => {
      // Arrange
      for (let i = 0; i < 50; i++) {
        rateLimiter.recordRequest('vehicle-123');
      }

      // Act & Assert
      expect(() => rateLimiter.checkLimit('vehicle-123')).toThrow(RateLimitError);
      expect(() => rateLimiter.checkLimit('vehicle-456')).not.toThrow(); // Different identifier
      expect(() => rateLimiter.checkLimit()).toThrow(RateLimitError); // Global limit
    });

    it('should_allowGlobalRequests_when_identifierRequestsUnderLimit', () => {
      // Arrange
      for (let i = 0; i < 30; i++) {
        rateLimiter.recordRequest('vehicle-123');
      }
      for (let i = 0; i < 15; i++) {
        rateLimiter.recordRequest(); // Global requests (no identifier)
      }

      // Act & Assert
      expect(() => rateLimiter.checkLimit()).not.toThrow(); // 45 total requests
      expect(() => rateLimiter.checkLimit('vehicle-123')).not.toThrow();
      expect(rateLimiter.getRequestCount()).toBe(45);
    });

    it('should_handleNullIdentifier_when_noIdentifierProvided', () => {
      // Arrange - use fresh instance to avoid interference from other tests
      const freshLimiter = new RateLimiter(config);

      for (let i = 0; i < 25; i++) {
        freshLimiter.recordRequest(); // No identifier = undefined internally
      }
      for (let i = 0; i < 25; i++) {
        freshLimiter.recordRequest('vehicle-123');
      }

      // Act & Assert
      expect(freshLimiter.getRequestCount()).toBe(50); // Total requests
      expect(freshLimiter.getRequestCount('vehicle-123')).toBe(25); // Vehicle-specific
      // Note: getRequestCount(undefined) returns total count (undefined is falsy)
      expect(freshLimiter.getRequestCount(undefined)).toBe(50); // Total (undefined treated as no filter)
    });
  });

  describe('Request Recording & Tracking', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(config);
    });

    it('should_recordRequest_when_recordRequestCalled', () => {
      // Act
      rateLimiter.recordRequest();

      // Assert
      expect(rateLimiter.getRequestCount()).toBe(1);
    });

    it('should_recordRequestWithIdentifier_when_identifierProvided', () => {
      // Act
      rateLimiter.recordRequest('vehicle-123');

      // Assert
      expect(rateLimiter.getRequestCount()).toBe(1);
      expect(rateLimiter.getRequestCount('vehicle-123')).toBe(1);
      expect(rateLimiter.getRequestCount('vehicle-456')).toBe(0);
    });

    it('should_trackTimestamp_when_requestRecorded', () => {
      // Arrange
      const requestTime = 1640995200000;
      mockDateNow.mockReturnValue(requestTime);

      // Act
      rateLimiter.recordRequest('vehicle-123');

      // Assert
      expect(rateLimiter.getRequestCount('vehicle-123')).toBe(1);
    });

    it('should_maintainRequestOrder_when_multipleRequestsRecorded', () => {
      // Arrange
      const baseTime = 1640995200000;

      // Record requests at different times
      for (let i = 0; i < 5; i++) {
        mockDateNow.mockReturnValue(baseTime + i * 1000);
        rateLimiter.recordRequest('vehicle-123');
      }

      // Act & Assert
      expect(rateLimiter.getRequestCount('vehicle-123')).toBe(5);
    });
  });

  describe('Time-based Cleanup & Window Management', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 10000 }); // 5 requests per 10 seconds
    });

    it('should_cleanupOldRequests_when_outsideWindow', () => {
      // Arrange
      const startTime = 1640995200000;
      mockDateNow.mockReturnValue(startTime);

      // Record some old requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordRequest('vehicle-123');
      }

      // Move forward past the window
      mockDateNow.mockReturnValue(startTime + 15000); // 15 seconds later

      // Act - trigger cleanup by calling getRequestCount
      const count = rateLimiter.getRequestCount('vehicle-123');

      // Assert
      expect(count).toBe(0); // Old requests should be cleaned up
    });

    it('should_keepRecentRequests_when_withinWindow', () => {
      // Arrange
      const startTime = 1640995200000;

      // Record requests at different times within the window
      for (let i = 0; i < 3; i++) {
        mockDateNow.mockReturnValue(startTime + i * 2000); // Every 2 seconds
        rateLimiter.recordRequest('vehicle-123');
      }

      // Move forward but stay within window
      mockDateNow.mockReturnValue(startTime + 8000); // 8 seconds later

      // Act
      const count = rateLimiter.getRequestCount('vehicle-123');

      // Assert
      expect(count).toBe(3); // All requests should still be valid
    });

    it('should_partiallyCleanup_when_someRequestsExpired', () => {
      // Arrange
      const startTime = 1640995200000;

      // Record old requests
      for (let i = 0; i < 2; i++) {
        mockDateNow.mockReturnValue(startTime + i * 1000);
        rateLimiter.recordRequest('vehicle-123');
      }

      // Record recent requests
      for (let i = 0; i < 2; i++) {
        mockDateNow.mockReturnValue(startTime + 8000 + i * 1000);
        rateLimiter.recordRequest('vehicle-123');
      }

      // Move forward to expire first 2 requests but keep last 2
      mockDateNow.mockReturnValue(startTime + 12000); // 12 seconds later

      // Act
      const count = rateLimiter.getRequestCount('vehicle-123');

      // Assert
      expect(count).toBe(2); // Only recent requests should remain
    });
  });

  describe('Time Until Reset', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({ maxRequests: 3, windowMs: 10000 }); // 3 requests per 10 seconds
    });

    it('should_returnZero_when_noRequests', () => {
      // Act
      const timeUntilReset = rateLimiter.getTimeUntilReset();

      // Assert
      expect(timeUntilReset).toBe(0);
    });

    it('should_returnZero_when_identifierHasNoRequests', () => {
      // Arrange
      rateLimiter.recordRequest('vehicle-123');

      // Act
      const timeUntilReset = rateLimiter.getTimeUntilReset('vehicle-456');

      // Assert
      expect(timeUntilReset).toBe(0);
    });

    it('should_calculateTimeUntilReset_when_requestsExist', () => {
      // Arrange
      const startTime = 1640995200000;
      mockDateNow.mockReturnValue(startTime);

      rateLimiter.recordRequest('vehicle-123'); // First request at startTime

      // Move forward 3 seconds
      mockDateNow.mockReturnValue(startTime + 3000);

      // Act
      const timeUntilReset = rateLimiter.getTimeUntilReset('vehicle-123');

      // Assert
      expect(timeUntilReset).toBe(7000); // 10000 - 3000 = 7000ms remaining
    });

    it('should_returnZero_when_windowExpired', () => {
      // Arrange
      const startTime = 1640995200000;
      mockDateNow.mockReturnValue(startTime);

      rateLimiter.recordRequest('vehicle-123');

      // Move forward past the window
      mockDateNow.mockReturnValue(startTime + 15000);

      // Act
      const timeUntilReset = rateLimiter.getTimeUntilReset('vehicle-123');

      // Assert
      expect(timeUntilReset).toBe(0);
    });

    it('should_calculateGlobalTimeUntilReset_when_noIdentifierProvided', () => {
      // Arrange
      const startTime = 1640995200000;
      mockDateNow.mockReturnValue(startTime);

      rateLimiter.recordRequest(); // Global request

      // Move forward 2 seconds
      mockDateNow.mockReturnValue(startTime + 2000);

      // Act
      const timeUntilReset = rateLimiter.getTimeUntilReset();

      // Assert
      expect(timeUntilReset).toBe(8000); // 10000 - 2000 = 8000ms remaining
    });
  });

  describe('Reset Functionality', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(config);
    });

    it('should_clearAllRequests_when_resetCalled', () => {
      // Arrange
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('vehicle-123');
        rateLimiter.recordRequest('vehicle-456');
        rateLimiter.recordRequest(); // Global requests
      }

      expect(rateLimiter.getRequestCount()).toBe(30);

      // Act
      rateLimiter.reset();

      // Assert
      expect(rateLimiter.getRequestCount()).toBe(0);
      expect(rateLimiter.getRequestCount('vehicle-123')).toBe(0);
      expect(rateLimiter.getRequestCount('vehicle-456')).toBe(0);
    });

    it('should_allowRequests_when_afterReset', () => {
      // Arrange
      for (let i = 0; i < 50; i++) {
        rateLimiter.recordRequest();
      }
      expect(() => rateLimiter.checkLimit()).toThrow(RateLimitError);

      // Act
      rateLimiter.reset();

      // Assert
      expect(() => rateLimiter.checkLimit()).not.toThrow();
      expect(rateLimiter.getRequestCount()).toBe(0);
    });
  });

  describe('Edge Cases & Error Scenarios', () => {
    it('should_handleZeroMaxRequests_gracefully', () => {
      // Arrange
      const restrictiveConfig: RateLimitConfig = { maxRequests: 0, windowMs: 1000 };
      const limiter = new RateLimiter(restrictiveConfig);

      // Act & Assert - with maxRequests: 0, any recorded request should exceed the limit
      limiter.recordRequest(); // Record at least one request
      expect(() => limiter.checkLimit()).toThrow(RateLimitError);
    });

    it('should_handleVeryShortWindow_gracefully', () => {
      // Arrange
      const shortWindowConfig: RateLimitConfig = { maxRequests: 1, windowMs: 1 };
      const limiter = new RateLimiter(shortWindowConfig);

      // Act
      limiter.recordRequest();

      // Move forward past the tiny window
      mockDateNow.mockReturnValue(Date.now() + 10);

      // Assert
      expect(() => limiter.checkLimit()).not.toThrow();
      expect(limiter.getRequestCount()).toBe(0);
    });

    it('should_handleConcurrentRequests_when_multipleCallsSimultaneous', () => {
      // Arrange
      rateLimiter = new RateLimiter({ maxRequests: 2, windowMs: 10000 });

      // Record up to the limit
      rateLimiter.recordRequest('vehicle-123');
      rateLimiter.recordRequest('vehicle-123');

      // Act & Assert
      expect(() => rateLimiter.checkLimit('vehicle-123')).toThrow(RateLimitError);
      expect(rateLimiter.getRequestCount('vehicle-123')).toBe(2);
    });

    it('should_maintainAccuracy_when_manyRequests', () => {
      // Arrange
      const largeConfig: RateLimitConfig = { maxRequests: 1000, windowMs: 60000 };
      const limiter = new RateLimiter(largeConfig);

      // Act
      for (let i = 0; i < 500; i++) {
        limiter.recordRequest('vehicle-123');
      }

      // Assert
      expect(limiter.getRequestCount('vehicle-123')).toBe(500);
      expect(() => limiter.checkLimit('vehicle-123')).not.toThrow();
    });

    it('should_handleEmptyIdentifier_when_emptyStringProvided', () => {
      // Arrange - use fresh instance to avoid interference from other tests
      const freshLimiter = new RateLimiter({ maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 });

      // Act
      freshLimiter.recordRequest('');
      freshLimiter.recordRequest('');

      // Assert
      expect(freshLimiter.getRequestCount('')).toBe(2);
      expect(() => freshLimiter.checkLimit('')).not.toThrow();
    });
  });
});
