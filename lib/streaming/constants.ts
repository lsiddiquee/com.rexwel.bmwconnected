/**
 * MQTT Streaming Constants
 *
 * Configuration constants for BMW CarData MQTT streaming connection.
 */

/**
 * BMW CarData MQTT broker hostname
 */
export const MQTT_BROKER_HOST = 'customer.streaming-cardata.bmwgroup.com';

/**
 * BMW CarData MQTT broker port (SSL/TLS)
 */
export const MQTT_BROKER_PORT = 9000;

/**
 * MQTT protocol (MQTT over SSL/TLS)
 */
export const MQTT_PROTOCOL = 'mqtts' as const;

/**
 * Default MQTT client ID prefix
 * Client IDs are generated as: {prefix}{hash(VIN)}
 */
export const DEFAULT_CLIENT_ID_PREFIX = 'homey-bmw-';

/**
 * Default MQTT keep-alive interval (seconds)
 * Send ping every 30 seconds to maintain connection
 */
export const DEFAULT_KEEPALIVE = 30;

/**
 * Default reconnection period (milliseconds)
 * Initial delay before reconnection attempt
 */
export const DEFAULT_RECONNECT_PERIOD = 1000;

/**
 * Default connection timeout (milliseconds)
 * Timeout for establishing initial connection
 */
export const DEFAULT_CONNECT_TIMEOUT = 30000;

/**
 * Default Quality of Service level
 * 0 = At most once, 1 = At least once, 2 = Exactly once
 */
export const DEFAULT_QOS = 1 as const;

/**
 * MQTT QoS (Quality of Service) levels
 */
export const MQTT_QOS_LEVELS = {
  /**
   * QoS 0: At most once delivery (fire and forget)
   * No acknowledgment, message may be lost
   */
  AT_MOST_ONCE: 0,

  /**
   * QoS 1: At least once delivery
   * Message delivered at least once, may have duplicates
   */
  AT_LEAST_ONCE: 1,

  /**
   * QoS 2: Exactly once delivery
   * Guaranteed single delivery (highest overhead)
   */
  EXACTLY_ONCE: 2,
} as const;

/**
 * Reconnection backoff configuration
 */
export const RECONNECT_DELAYS = {
  /**
   * Minimum reconnection delay (milliseconds)
   */
  MIN: 1000, // 1 second

  /**
   * Maximum reconnection delay (milliseconds)
   */
  MAX: 60000, // 60 seconds

  /**
   * Exponential backoff multiplier
   * Delay doubles on each failed attempt
   */
  MULTIPLIER: 2,

  /**
   * Random jitter to add to delay (milliseconds)
   * Prevents thundering herd problem
   */
  JITTER: 1000, // 0-1000ms random
} as const;

/**
 * Message validation constants
 */
export const MESSAGE_VALIDATION = {
  /**
   * Valid VIN length (Vehicle Identification Number)
   */
  VIN_LENGTH: 17,

  /**
   * Maximum message age before considering stale (milliseconds)
   * Messages older than 5 minutes are considered stale
   */
  MAX_MESSAGE_AGE: 5 * 60 * 1000, // 5 minutes

  /**
   * Maximum message size (bytes)
   * Reasonable limit to prevent memory issues
   */
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1 MB
} as const;

/**
 * Connection state transition timeout (milliseconds)
 * How long to wait for state transition before considering error
 */
export const STATE_TRANSITION_TIMEOUT = 10000; // 10 seconds
