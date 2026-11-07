/**
 * MQTT Client Interface
 *
 * Contract for MQTT client implementations that connect to BMW CarData streaming service.
 */

import type { StreamMessage } from './StreamMessage';

/**
 * MQTT connection state
 */
export type ConnectionState =
  | 'disconnected' // Not connected to broker
  | 'connecting' // Connection attempt in progress
  | 'connected' // Successfully connected and authenticated
  | 'reconnecting' // Link is down and something will bring it back (see onStateChange)
  | 'error'; // connect() itself failed

/**
 * MQTT Quality of Service level
 * - 0: At most once (fire and forget)
 * - 1: At least once (acknowledged delivery)
 * - 2: Exactly once (guaranteed single delivery)
 */
export type QoS = 0 | 1 | 2;

/**
 * MQTT client interface for BMW CarData streaming
 */
export interface IMqttClient {
  /**
   * Connect to MQTT broker
   *
   * Establishes connection with authentication using OAuth tokens.
   * Automatically handles SSL/TLS and credential derivation.
   *
   * @throws AuthenticationError if credentials are invalid
   * @throws NetworkError if connection fails
   * @throws TimeoutError if connection times out
   */
  connect(): Promise<void>;

  /**
   * Disconnect from MQTT broker
   *
   * Gracefully closes connection, unsubscribes from all topics,
   * and cleans up resources.
   */
  disconnect(): Promise<void>;

  /**
   * Check if client is currently connected
   *
   * @returns True if connected to broker
   */
  isConnected(): boolean;

  /**
   * Get current connection state
   *
   * @returns Current connection state
   */
  getConnectionState(): ConnectionState;

  /**
   * Subscribe to MQTT topic
   *
   * Subscribes to receive messages from the specified topic.
   * For BMW CarData, topic should be the vehicle VIN.
   *
   * @param topic - MQTT topic to subscribe to (typically VIN)
   * @param qos - Quality of Service level (default: 1)
   * @throws Error if not connected
   * @throws Error if subscription fails
   */
  subscribe(topic: string, qos?: QoS): Promise<void>;

  /**
   * Unsubscribe from MQTT topic
   *
   * Stops receiving messages from the specified topic.
   *
   * @param topic - MQTT topic to unsubscribe from
   * @throws Error if not connected
   */
  unsubscribe(topic: string): Promise<void>;

  /**
   * Get list of active subscriptions
   *
   * @returns Array of subscribed topic names
   */
  getActiveSubscriptions(): string[];

  /**
   * Register handler for connection event
   *
   * Called when successfully connected to broker.
   *
   * @param handler - Callback function
   */
  onConnect(handler: () => void): void;

  /**
   * Register handler for disconnection event
   *
   * Called when disconnected from broker (intentional or unintentional).
   *
   * @param handler - Callback function with optional error
   */
  onDisconnect(handler: (error?: Error) => void): void;

  /**
   * Register handler for reconnection event
   *
   * Called when attempting to reconnect after disconnect.
   *
   * @param handler - Callback function
   */
  onReconnect(handler: () => void): void;

  /**
   * Register handler for connection state changes
   *
   * Called every time the connection state actually changes value (never twice in a row with
   * the same state). Semantics:
   * - 'connecting': connect() is in progress
   * - 'connected': the broker accepted the connection (also after automatic reconnects and
   *   after the client's own credential recovery or renewal)
   * - 'reconnecting': the link is down and something will bring it back: mqtt.js automatic
   *   reconnect, credential recovery in progress, or waiting for a recovery retry
   * - 'error': connect() itself failed (it throws and the owner decides what to do)
   * - 'disconnected': the owner called disconnect()
   *
   * @param handler - Callback function with the new state
   */
  onStateChange(handler: (state: ConnectionState) => void): void;

  /**
   * Register handler for message event
   *
   * Called when a message is received from subscribed topic.
   *
   * @param handler - Callback function with topic and parsed message
   */
  onMessage(handler: (topic: string, message: StreamMessage) => void): void;

  /**
   * Register handler for error event
   *
   * Called when an error occurs (connection, subscription, message parsing, etc.).
   *
   * @param handler - Callback function with error
   */
  onError(handler: (error: Error) => void): void;
}
