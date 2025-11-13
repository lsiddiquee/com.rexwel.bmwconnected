/**
 * MQTT Stream Message Models
 *
 * Data models for BMW CarData MQTT streaming messages.
 */

import type { TelematicDataPoint } from '../models/TelematicDataPoint';
import { MESSAGE_VALIDATION } from './constants';

/**
 * MQTT stream message from BMW CarData API
 */
export interface StreamMessage {
  /**
   * Vehicle Identification Number (17 characters)
   */
  vin: string;

  /**
   * Unique entity identifier (UUID)
   */
  entityId: string;

  /**
   * MQTT topic (matches VIN)
   */
  topic: string;

  /**
   * ISO 8601 timestamp when message was sent by broker
   */
  timestamp: string;

  /**
   * Telematic data points
   * Key: telematic key (e.g., "vehicle.vehicle.travelledDistance")
   * Value: telematic data point with timestamp, value, and optional unit
   */
  data: Record<string, TelematicDataPoint>;
}

/**
 * Stream message validator
 */
export class StreamMessageValidator {
  /**
   * Validate if an unknown object is a valid StreamMessage
   *
   * @param message - Object to validate
   * @returns True if valid StreamMessage
   */
  static validate(message: unknown): message is StreamMessage {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Record<string, unknown>;

    // Validate required string fields
    if (
      typeof msg.vin !== 'string' ||
      typeof msg.entityId !== 'string' ||
      typeof msg.topic !== 'string' ||
      typeof msg.timestamp !== 'string'
    ) {
      return false;
    }

    // Validate VIN length
    if (msg.vin.length !== MESSAGE_VALIDATION.VIN_LENGTH) {
      return false;
    }

    // Validate topic contains VIN (format: {gcid}/{vin} or just {vin})
    if (!msg.topic.endsWith(msg.vin) && msg.topic !== msg.vin) {
      return false;
    }

    // Validate timestamp format (basic ISO 8601 check)
    if (!this.isValidIso8601(msg.timestamp)) {
      return false;
    }

    // Validate data object
    if (typeof msg.data !== 'object' || msg.data === null || Array.isArray(msg.data)) {
      return false;
    }

    // Validate at least one telematic data point
    const dataKeys = Object.keys(msg.data);
    if (dataKeys.length === 0) {
      return false;
    }

    // Validate each telematic data point
    for (const key of dataKeys) {
      const dataPoint = (msg.data as Record<string, unknown>)[key];

      if (!this.isValidTelematicDataPoint(dataPoint)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Parse buffer to StreamMessage
   *
   * @param buffer - Buffer containing JSON message
   * @returns Parsed StreamMessage
   * @throws Error if buffer is not valid JSON or doesn't match schema
   */
  static parse(buffer: Buffer): StreamMessage {
    // Check message size
    if (buffer.length > MESSAGE_VALIDATION.MAX_MESSAGE_SIZE) {
      throw new Error(
        `Message too large: ${buffer.length} bytes (max ${MESSAGE_VALIDATION.MAX_MESSAGE_SIZE})`
      );
    }

    // Parse JSON
    let message: unknown;
    try {
      message = JSON.parse(buffer.toString('utf8'));
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // Validate schema
    if (!this.validate(message)) {
      throw new Error('Invalid StreamMessage schema');
    }

    // Add source marker to all data points
    for (const dataPoint of Object.values(message.data)) {
      dataPoint.source = 'mqtt';
    }

    return message;
  }

  /**
   * Check if message timestamp is recent (not stale)
   *
   * @param message - StreamMessage to check
   * @returns True if message is recent
   */
  static isMessageFresh(message: StreamMessage): boolean {
    try {
      const messageTime = new Date(message.timestamp).getTime();
      const now = Date.now();
      const age = now - messageTime;

      return age >= 0 && age <= MESSAGE_VALIDATION.MAX_MESSAGE_AGE;
    } catch {
      return false; // Invalid timestamp
    }
  }

  /**
   * Validate ISO 8601 timestamp format
   *
   * BMW sends timestamps in various formats:
   * - With 3-digit milliseconds: "2025-10-18T20:31:42.312Z"
   * - With 2-digit milliseconds: "2025-10-21T06:16:45.61Z"
   * - With 1-digit milliseconds: "2025-10-21T06:16:45.6Z"
   * - Without milliseconds: "2025-10-18T20:31:43Z"
   *
   * @param timestamp - Timestamp string to validate
   * @returns True if valid ISO 8601
   */
  private static isValidIso8601(timestamp: string): boolean {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return false;
      }

      // Normalize both timestamps by removing milliseconds for comparison
      const isoString = date.toISOString();
      const normalizedIso = isoString.replace(/\.\d+Z$/, 'Z');
      const normalizedInput = timestamp.replace(/\.\d+Z$/, 'Z');

      // Accept if they match after normalization, or if exact match
      return isoString === timestamp || normalizedIso === normalizedInput;
    } catch {
      return false;
    }
  }

  /**
   * Validate telematic data point structure
   *
   * @param dataPoint - Data point to validate
   * @returns True if valid TelematicDataPoint
   */
  private static isValidTelematicDataPoint(dataPoint: unknown): dataPoint is TelematicDataPoint {
    if (typeof dataPoint !== 'object' || dataPoint === null) {
      return false;
    }

    const point = dataPoint as Record<string, unknown>;

    // Validate required fields
    if (typeof point.timestamp !== 'string') {
      return false;
    }

    if (
      typeof point.value !== 'string' &&
      typeof point.value !== 'number' &&
      typeof point.value !== 'boolean'
    ) {
      return false;
    }

    // Validate optional unit field
    if (point.unit !== undefined && typeof point.unit !== 'string') {
      return false;
    }

    // Validate timestamp format
    if (!this.isValidIso8601(point.timestamp)) {
      return false;
    }

    return true;
  }
}
