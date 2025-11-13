/**
 * API Polling Manager
 *
 * Manages API polling schedule and rate limiting for BMW CarData API.
 * Enforces BMW's 50 requests per 24 hours limit.
 *
 * Strategy:
 * - Default: 2 calls/hour (30-minute intervals) = 48 calls/day
 * - Skip polling when MQTT is active (save quota)
 * - Increase interval when quota is low
 * - Pause when quota exhausted, resume at midnight UTC
 *
 * @see https://api-cardata.bmwgroup.com
 */

import type { ILogger } from '../lib/types/ILogger';

/**
 * Polling configuration options
 */
export interface ApiPollingConfig {
  /**
   * Enable/disable API polling
   * @default true
   */
  enabled: boolean;

  /**
   * Polling interval in minutes
   * @default 30
   */
  intervalMinutes: number;

  /**
   * Maximum requests per 24 hours (BMW API limit)
   * @default 50
   */
  maxDailyRequests: number;
}

/**
 * Quota tracking information
 */
export interface ApiQuotaInfo {
  /**
   * Number of requests made in current 24-hour window
   */
  requestCount: number;

  /**
   * Remaining requests in current 24-hour window
   */
  remaining: number;

  /**
   * Timestamp when quota resets (midnight UTC)
   */
  resetsAt: Date;

  /**
   * Whether quota is exhausted
   */
  isExhausted: boolean;

  /**
   * Whether quota is low (< 20% remaining)
   */
  isLow: boolean;
}

/**
 * Polling schedule entry
 */
interface PollingSchedule {
  /**
   * Device identifier (VIN)
   */
  deviceId: string;

  /**
   * Next scheduled poll timestamp
   */
  nextPoll: number;

  /**
   * Timer handle for cancellation
   */
  timer?: NodeJS.Timeout;

  /**
   * Whether MQTT is currently active for this device
   */
  mqttActive: boolean;
}

/**
 * ApiPollingManager - Manages API polling with rate limiting
 *
 * Features:
 * - Global rate limiting (50 requests/24h)
 * - Per-device polling schedules
 * - Smart quota management
 * - MQTT-aware polling (skip when MQTT active)
 * - Automatic quota reset at midnight UTC
 *
 * @example
 * const pollingManager = new ApiPollingManager({
 *   logger: myLogger,
 *   onPoll: async (deviceId) => {
 *     await fetchVehicleData(deviceId);
 *   }
 * });
 *
 * pollingManager.schedulePolling('VIN123', { enabled: true, intervalMinutes: 30 });
 */
export class ApiPollingManager {
  private readonly logger?: ILogger;
  private readonly onPoll: (deviceId: string) => Promise<void>;

  /**
   * Polling schedules by device ID
   */
  private readonly schedules: Map<string, PollingSchedule> = new Map();

  /**
   * Request count for current 24-hour window
   */
  private requestCount: number = 0;

  /**
   * Timestamp of last quota reset (midnight UTC)
   */
  private lastReset: Date;

  /**
   * Maximum requests per 24 hours
   */
  private readonly maxDailyRequests: number = 50;

  /**
   * Timer for automatic quota reset at midnight UTC
   */
  private resetTimer?: NodeJS.Timeout;

  /**
   * Creates a new ApiPollingManager
   *
   * @param options - Configuration options
   */
  constructor(options: {
    logger?: ILogger;
    onPoll: (deviceId: string) => Promise<void>;
    maxDailyRequests?: number;
  }) {
    this.logger = options.logger;
    this.onPoll = options.onPoll;
    this.maxDailyRequests = options.maxDailyRequests ?? 50;
    this.lastReset = this.getMidnightUTC();

    // Schedule automatic quota reset at midnight UTC
    this.scheduleQuotaReset();

    this.logger?.debug('ApiPollingManager initialized', {
      maxDailyRequests: this.maxDailyRequests,
      nextReset: this.getNextMidnightUTC(),
    });
  }

  /**
   * Schedule polling for a device
   *
   * @param deviceId - Device identifier (VIN)
   * @param config - Polling configuration
   */
  schedulePolling(deviceId: string, config: ApiPollingConfig): void {
    this.logger?.debug(`Scheduling polling for device: ${deviceId}`, {
      enabled: config.enabled,
      intervalMinutes: config.intervalMinutes,
      maxDailyRequests: config.maxDailyRequests,
    });

    // Cancel existing schedule if any
    this.cancelPolling(deviceId);

    if (!config.enabled) {
      this.logger?.debug(`Polling disabled for device: ${deviceId}`);
      return;
    }

    // Create new schedule
    const schedule: PollingSchedule = {
      deviceId,
      nextPoll: Date.now() + config.intervalMinutes * 60 * 1000,
      mqttActive: false,
    };

    this.schedules.set(deviceId, schedule);

    // Schedule first poll
    this.scheduleNextPoll(deviceId, config.intervalMinutes);
  }

  /**
   * Cancel polling for a device
   *
   * @param deviceId - Device identifier (VIN)
   */
  cancelPolling(deviceId: string): void {
    const schedule = this.schedules.get(deviceId);
    if (schedule?.timer) {
      clearTimeout(schedule.timer);
    }
    this.schedules.delete(deviceId);
    this.logger?.debug(`Polling cancelled for device: ${deviceId}`);
  }

  /**
   * Update MQTT status for a device
   *
   * When MQTT is active, polling is skipped to save quota.
   *
   * @param deviceId - Device identifier (VIN)
   * @param isActive - Whether MQTT is currently active
   */
  setMqttStatus(deviceId: string, isActive: boolean): void {
    const schedule = this.schedules.get(deviceId);
    if (schedule) {
      schedule.mqttActive = isActive;
      this.logger?.debug(
        `MQTT status updated for ${deviceId}: ${isActive ? 'active' : 'inactive'}`
      );
    }
  }

  /**
   * Get current quota information
   *
   * @returns Quota info including remaining requests and reset time
   */
  getQuotaInfo(): ApiQuotaInfo {
    const remaining = Math.max(0, this.maxDailyRequests - this.requestCount);
    const isExhausted = remaining === 0;
    const isLow = remaining < this.maxDailyRequests * 0.2; // < 20%

    return {
      requestCount: this.requestCount,
      remaining,
      resetsAt: this.getNextMidnightUTC(),
      isExhausted,
      isLow,
    };
  }

  /**
   * Get last quota reset time
   *
   * @returns Last reset date (midnight UTC)
   */
  getLastResetTime(): Date {
    return this.lastReset;
  }

  /**
   * Manually trigger a poll for a device (bypasses schedule)
   *
   * @param deviceId - Device identifier (VIN)
   * @returns Whether poll was executed (false if quota exhausted)
   */
  async triggerPoll(deviceId: string): Promise<boolean> {
    const quota = this.getQuotaInfo();

    if (quota.isExhausted) {
      this.logger?.warn(
        `Cannot poll ${deviceId}: quota exhausted (resets at ${quota.resetsAt.toISOString()})`
      );
      return false;
    }

    this.logger?.info(`Manual poll triggered for device: ${deviceId}`);
    await this.executePoll(deviceId);
    return true;
  }

  /**
   * Get all active polling schedules
   *
   * @returns Map of device IDs to schedule info
   */
  getSchedules(): Map<string, { nextPoll: Date; mqttActive: boolean }> {
    const result = new Map<string, { nextPoll: Date; mqttActive: boolean }>();

    for (const [deviceId, schedule] of this.schedules) {
      result.set(deviceId, {
        nextPoll: new Date(schedule.nextPoll),
        mqttActive: schedule.mqttActive,
      });
    }

    return result;
  }

  /**
   * Cleanup all timers and schedules
   */
  destroy(): void {
    // Cancel all device polling
    for (const deviceId of this.schedules.keys()) {
      this.cancelPolling(deviceId);
    }

    // Cancel quota reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    this.logger?.debug('ApiPollingManager destroyed');
  }

  /**
   * Schedule next poll for a device
   *
   * @param deviceId - Device identifier
   * @param intervalMinutes - Polling interval in minutes
   * @private
   */
  private scheduleNextPoll(deviceId: string, intervalMinutes: number): void {
    const schedule = this.schedules.get(deviceId);
    if (!schedule) {
      return;
    }

    // Adjust interval based on quota
    const quota = this.getQuotaInfo();
    let adjustedInterval = intervalMinutes;

    if (quota.isExhausted) {
      // Quota exhausted - wait until reset
      const msUntilReset = this.getNextMidnightUTC().getTime() - Date.now();
      this.logger?.warn(
        `Quota exhausted, pausing polling until ${this.getNextMidnightUTC().toISOString()}`
      );

      schedule.timer = setTimeout(() => {
        this.scheduleNextPoll(deviceId, intervalMinutes);
      }, msUntilReset);
      return;
    }

    if (quota.isLow) {
      // Quota low - increase interval to 60 minutes
      adjustedInterval = 60;
      this.logger?.debug(
        `Quota low (${quota.remaining} remaining), increasing interval to ${adjustedInterval} minutes`
      );
    }

    const intervalMs = adjustedInterval * 60 * 1000;
    schedule.nextPoll = Date.now() + intervalMs;

    schedule.timer = setTimeout(() => {
      void this.executePoll(deviceId).then(() => {
        this.scheduleNextPoll(deviceId, intervalMinutes);
      });
    }, intervalMs);
  }

  /**
   * Execute poll for a device
   *
   * @param deviceId - Device identifier
   * @private
   */
  private async executePoll(deviceId: string): Promise<void> {
    const schedule = this.schedules.get(deviceId);
    if (!schedule) {
      return;
    }

    // Skip if MQTT is active (save quota)
    if (schedule.mqttActive) {
      this.logger?.debug(`Skipping poll for ${deviceId}: MQTT active`);
      return;
    }

    const quota = this.getQuotaInfo();
    if (quota.isExhausted) {
      this.logger?.warn(`Skipping poll for ${deviceId}: quota exhausted`);
      return;
    }

    try {
      this.logger?.debug(
        `Executing poll for device: ${deviceId} (${quota.remaining} requests remaining)`
      );

      // Increment request count before calling onPoll
      this.requestCount++;

      await this.onPoll(deviceId);

      this.logger?.info(
        `Poll completed for ${deviceId} (${quota.remaining - 1} requests remaining)`
      );
    } catch (error) {
      this.logger?.error(`Poll failed for ${deviceId}`, error as Error);
      // Don't decrement request count on error (request was still made)
    }
  }

  /**
   * Schedule automatic quota reset at next midnight UTC
   *
   * @private
   */
  private scheduleQuotaReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    const msUntilMidnight = this.getNextMidnightUTC().getTime() - Date.now();

    this.resetTimer = setTimeout(() => {
      this.resetQuota();
      this.scheduleQuotaReset(); // Schedule next reset
    }, msUntilMidnight);

    this.logger?.debug(`Quota reset scheduled for ${this.getNextMidnightUTC().toISOString()}`);
  }

  /**
   * Reset quota counter
   *
   * @private
   */
  private resetQuota(): void {
    const previousCount = this.requestCount;
    this.requestCount = 0;
    this.lastReset = this.getMidnightUTC();

    this.logger?.info(
      `Quota reset: ${previousCount} requests in previous 24h period. Next reset: ${this.getNextMidnightUTC().toISOString()}`
    );
  }

  /**
   * Get midnight UTC for today
   *
   * @returns Midnight UTC date
   * @private
   */
  private getMidnightUTC(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );
  }

  /**
   * Get next midnight UTC
   *
   * @returns Next midnight UTC date
   * @private
   */
  private getNextMidnightUTC(): Date {
    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
    );
    return tomorrow;
  }
}
