/**
 * Streaming Module Exports
 *
 * MQTT streaming client for real-time vehicle data from BMW CarData API.
 */

// Interfaces
export type { IMqttClient, ConnectionState, QoS } from './IMqttClient';

// Implementation
export { MqttStreamClient } from './MqttStreamClient';
export type { MqttStreamClientOptions } from './MqttStreamClient';

// Models
export type { StreamMessage } from './StreamMessage';
export { StreamMessageValidator } from './StreamMessage';

// Constants
export {
  MQTT_BROKER_HOST,
  MQTT_BROKER_PORT,
  MQTT_PROTOCOL,
  DEFAULT_CLIENT_ID_PREFIX,
  DEFAULT_KEEPALIVE,
  DEFAULT_RECONNECT_PERIOD,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_QOS,
  MQTT_QOS_LEVELS,
  RECONNECT_DELAYS,
  MESSAGE_VALIDATION,
  STATE_TRANSITION_TIMEOUT,
} from './constants';
