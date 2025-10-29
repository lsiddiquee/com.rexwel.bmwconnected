/**
 * Rate limiter for HTTP requests
 *
 * Implements a sliding window rate limiter to prevent exceeding API quotas.
 * BMW CarData API allows 50 requests per 24 hours per vehicle.
 */

import { RateLimitError } from '../types/errors';

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

export interface RequestRecord {
  /** Timestamp when the request was made (Unix ms) */
  timestamp: number;
  /** Optional identifier (e.g., VIN for per-vehicle limiting) */
  identifier?: string;
}

/**
 * Sliding window rate limiter
 *
 * Tracks requests and enforces rate limits using a sliding window algorithm.
 * Supports both global and per-identifier (e.g., per-vehicle) rate limiting.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({ maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 });
 *
 * // Check if request is allowed
 * await limiter.checkLimit('vehicle-vin-123');
 *
 * // Record a request
 * limiter.recordRequest('vehicle-vin-123');
 * ```
 */
export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly requests: RequestRecord[] = [];

  /**
   * Create a new rate limiter
   *
   * @param config - Rate limit configuration
   */
  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if a request is allowed under the rate limit
   *
   * @param identifier - Optional identifier for per-entity rate limiting
   * @throws {RateLimitError} If rate limit would be exceeded
   */
  checkLimit(identifier?: string): void {
    this.cleanupOldRequests();

    const relevantRequests = identifier
      ? this.requests.filter((r) => r.identifier === identifier)
      : this.requests;

    if (relevantRequests.length >= this.config.maxRequests) {
      const oldestRequest = relevantRequests[0];
      const resetTime = oldestRequest.timestamp + this.config.windowMs;
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      throw new RateLimitError(
        `Rate limit exceeded: ${this.config.maxRequests} requests per ${this.config.windowMs}ms`,
        retryAfter
      );
    }
  }

  /**
   * Record a request
   *
   * @param identifier - Optional identifier for per-entity tracking
   */
  recordRequest(identifier?: string): void {
    this.requests.push({
      timestamp: Date.now(),
      identifier,
    });

    // Keep the array size reasonable
    this.cleanupOldRequests();
  }

  /**
   * Get the number of requests made in the current window
   *
   * @param identifier - Optional identifier to filter by
   * @returns Number of requests in the window
   */
  getRequestCount(identifier?: string): number {
    this.cleanupOldRequests();

    if (identifier) {
      return this.requests.filter((r) => r.identifier === identifier).length;
    }

    return this.requests.length;
  }

  /**
   * Get the time until the rate limit resets
   *
   * @param identifier - Optional identifier to filter by
   * @returns Milliseconds until reset, or 0 if not at limit
   */
  getTimeUntilReset(identifier?: string): number {
    this.cleanupOldRequests();

    const relevantRequests = identifier
      ? this.requests.filter((r) => r.identifier === identifier)
      : this.requests;

    if (relevantRequests.length === 0) {
      return 0;
    }

    const oldestRequest = relevantRequests[0];
    const resetTime = oldestRequest.timestamp + this.config.windowMs;
    const timeUntilReset = resetTime - Date.now();

    return Math.max(0, timeUntilReset);
  }

  /**
   * Reset all recorded requests
   *
   * Useful for testing or manual reset scenarios
   */
  reset(): void {
    this.requests.length = 0;
  }

  /**
   * Remove requests that are outside the current window
   */
  private cleanupOldRequests(): void {
    const cutoff = Date.now() - this.config.windowMs;
    const validIndex = this.requests.findIndex((r) => r.timestamp > cutoff);

    if (validIndex > 0) {
      this.requests.splice(0, validIndex);
    } else if (validIndex === -1 && this.requests.length > 0) {
      // All requests are old
      this.requests.length = 0;
    }
  }
}
