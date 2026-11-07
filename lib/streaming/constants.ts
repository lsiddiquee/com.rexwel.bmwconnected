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
 * Retry schedule for a failed credential recovery (milliseconds)
 *
 * When reconnecting with fresh credentials fails (e.g. BMW's token endpoint is briefly
 * unavailable), the client keeps retrying: first wait is STEPS[0], then STEPS[1], and so on.
 * Once the steps are exhausted every further retry waits MAX. A successful reconnect restarts
 * the schedule.
 */
export const RECOVERY_RETRY_DELAYS = {
  /**
   * Delay before each of the first retries: 30 s, 60 s, 120 s, 240 s, 480 s
   */
  STEPS: [30000, 60000, 120000, 240000, 480000] as readonly number[],

  /**
   * Delay between all later retries (milliseconds)
   */
  MAX: 900000, // 15 minutes
} as const;

/**
 * Proactive credential renewal configuration
 *
 * The broker password is the OAuth id_token, which expires roughly an hour after it was issued.
 * mqtt.js keeps reusing the original password when it reconnects, so the client reconnects
 * with fresh credentials shortly before the token used for the connection expires.
 */
export const CREDENTIAL_RENEWAL = {
  /**
   * How long before the token expires the renewal is scheduled (milliseconds)
   * Must be below the auth provider's 60 s refresh buffer so that fetching credentials at that
   * moment really refreshes the token.
   */
  LEAD_TIME: 45000, // 45 seconds

  /**
   * Minimum delay before a renewal fires (milliseconds)
   * Protects against reconnect loops when a token is already (almost) expired.
   */
  MIN_DELAY: 30000, // 30 seconds

  /**
   * Maximum delay of the renewal timer (milliseconds)
   * Node.js timers overflow above 2^31 - 1 ms and then fire after 1 ms, so a bogus far-future
   * expiry must not be passed through unchanged.
   */
  MAX_DELAY: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * Maximum time to wait for mqtt.js to finish ending a client (milliseconds)
 * A client that never reports back must not block recovery forever.
 */
export const CLIENT_END_TIMEOUT = 5000; // 5 seconds

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
