/**
 * MQTT Stream Client Implementation
 *
 * Concrete implementation of IMqttClient using mqtt.js library.
 * Connects to BMW CarData MQTT broker for real-time vehicle data streaming.
 */

import * as mqtt from 'mqtt';
import { createHash } from 'crypto';
import type { IAuthProvider } from '../auth/IAuthProvider';
import type { ILogger } from '../types/ILogger';
import type { IMqttClient, ConnectionState, QoS } from './IMqttClient';
import type { StreamMessage } from './StreamMessage';
import { StreamMessageValidator } from './StreamMessage';
import {
  MQTT_BROKER_HOST,
  MQTT_BROKER_PORT,
  MQTT_PROTOCOL,
  DEFAULT_CLIENT_ID_PREFIX,
  DEFAULT_KEEPALIVE,
  DEFAULT_RECONNECT_PERIOD,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_QOS,
} from './constants';
import { AuthenticationError, NetworkError, TimeoutError, ValidationError } from '../types/errors';

/**
 * MQTT stream client configuration options
 */
export interface MqttStreamClientOptions {
  /**
   * MQTT broker hostname
   * @default 'customer.streaming-cardata.bmwgroup.com'
   */
  broker?: string;

  /**
   * MQTT broker port
   * @default 9000
   */
  port?: number;

  /**
   * MQTT protocol
   * @default 'mqtts'
   */
  protocol?: 'mqtts' | 'wss';

  /**
   * Client ID prefix for generating stable client IDs
   * @default 'homey-bmw-'
   */
  clientIdPrefix?: string;

  /**
   * Keep-alive interval in seconds
   * @default 60
   */
  keepalive?: number;

  /**
   * Reconnection period in milliseconds
   * @default 1000
   */
  reconnectPeriod?: number;

  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  connectTimeout?: number;

  /**
   * Clean session flag
   * @default false (resume session)
   */
  clean?: boolean;

  /**
   * Auto-resubscribe to topics on reconnect
   * @default true
   */
  resubscribe?: boolean;

  /**
   * Default Quality of Service level
   * @default 1
   */
  qos?: QoS;
}

/**
 * MQTT credentials derived from OAuth tokens
 */
interface MqttCredentials {
  username: string; // gcid from token
  password: string; // id_token
  clientId: string; // generated stable ID
  gcid: string; // gcid for topic construction
}

/**
 * Event handler map
 */
type EventHandlers = {
  connect: (() => void)[];
  disconnect: ((error?: Error) => void)[];
  reconnect: (() => void)[];
  message: ((topic: string, message: StreamMessage) => void)[];
  error: ((error: Error) => void)[];
};

/**
 * MQTT Stream Client for BMW CarData API
 */
export class MqttStreamClient implements IMqttClient {
  private client?: mqtt.MqttClient;
  private authProvider: IAuthProvider;
  private logger?: ILogger;
  private options: Required<MqttStreamClientOptions>;
  private subscriptions: Map<string, QoS>;
  private connectionState: ConnectionState;
  private eventHandlers: EventHandlers;
  private vin?: string; // Vehicle VIN for client ID generation
  private gcid?: string; // Global Customer ID for topic construction
  private isReconnecting: boolean; // Flag to prevent reconnect loops

  /**
   * Create MQTT stream client
   *
   * @param authProvider - OAuth authentication provider
   * @param options - MQTT client configuration
   * @param logger - Optional logger
   * @param vin - Vehicle VIN (used for stable client ID generation)
   */
  constructor(
    authProvider: IAuthProvider,
    options: MqttStreamClientOptions = {},
    logger?: ILogger,
    vin?: string
  ) {
    this.authProvider = authProvider;
    this.logger = logger;
    this.vin = vin;

    // Apply default options
    this.options = {
      broker: options.broker ?? MQTT_BROKER_HOST,
      port: options.port ?? MQTT_BROKER_PORT,
      protocol: options.protocol ?? MQTT_PROTOCOL,
      clientIdPrefix: options.clientIdPrefix ?? DEFAULT_CLIENT_ID_PREFIX,
      keepalive: options.keepalive ?? DEFAULT_KEEPALIVE,
      reconnectPeriod: options.reconnectPeriod ?? DEFAULT_RECONNECT_PERIOD,
      connectTimeout: options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT,
      clean: options.clean ?? false,
      resubscribe: options.resubscribe ?? true,
      qos: options.qos ?? DEFAULT_QOS,
    };

    this.subscriptions = new Map();
    this.connectionState = 'disconnected';
    this.eventHandlers = {
      connect: [],
      disconnect: [],
      reconnect: [],
      message: [],
      error: [],
    };
    this.isReconnecting = false;
  }

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<void> {
    if (this.client?.connected) {
      return;
    }

    this.logger?.info('Connecting to MQTT broker', {
      broker: this.options.broker,
      port: this.options.port,
    });

    this.connectionState = 'connecting';

    try {
      // Get MQTT credentials from OAuth tokens
      const credentials = await this.getMqttCredentials();

      // Store gcid for topic construction
      this.gcid = credentials.gcid;

      // Create MQTT client
      const brokerUrl = `${this.options.protocol}://${this.options.broker}:${this.options.port}`;

      this.client = mqtt.connect(brokerUrl, {
        clientId: credentials.clientId,
        username: credentials.username,
        password: credentials.password,
        keepalive: this.options.keepalive,
        reconnectPeriod: this.options.reconnectPeriod,
        connectTimeout: this.options.connectTimeout,
        clean: this.options.clean,
        resubscribe: this.options.resubscribe,
      });

      // Register event handlers
      this.setupEventHandlers();

      // Wait for connection
      await this.waitForConnection();

      this.connectionState = 'connected';
    } catch (error) {
      this.connectionState = 'error';
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Failed to connect to MQTT broker', err);
      throw error;
    }
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    this.logger?.info('Disconnecting from MQTT broker');

    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          this.connectionState = 'disconnected';
          this.client = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Subscribe to MQTT topic
   *
   * @param vinOrTopic - VIN to subscribe to, or full topic path
   *                     If just VIN provided, will construct {gcid}/{vin} topic
   * @param qos - Quality of Service level
   */
  async subscribe(vinOrTopic: string, qos: QoS = this.options.qos): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('MQTT client not connected');
    }

    if (!this.gcid) {
      throw new Error('MQTT gcid not available');
    }

    // Build topic: {gcid}/{vin}
    // If vinOrTopic already contains '/', assume it's a full topic
    const topic = vinOrTopic.includes('/') ? vinOrTopic : `${this.gcid}/${vinOrTopic}`;

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not available'));
        return;
      }

      this.client.subscribe(topic, { qos }, (error) => {
        if (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger?.error('Failed to subscribe to MQTT topic', err, { topic });
          reject(error);
        } else {
          this.subscriptions.set(topic, qos);
          this.logger?.info('Subscribed to MQTT topic', { topic, qos });
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from MQTT topic
   */
  async unsubscribe(topic: string): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('MQTT client not connected');
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not available'));
        return;
      }

      this.client.unsubscribe(topic, {}, (error) => {
        if (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger?.error('Failed to unsubscribe from MQTT topic', err, { topic });
          reject(error);
        } else {
          this.subscriptions.delete(topic);
          this.logger?.info('Unsubscribed from MQTT topic', { topic });
          resolve();
        }
      });
    });
  }

  /**
   * Get list of active subscriptions
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Register handler for connection event
   */
  onConnect(handler: () => void): void {
    this.eventHandlers.connect.push(handler);
  }

  /**
   * Register handler for disconnection event
   */
  onDisconnect(handler: (error?: Error) => void): void {
    this.eventHandlers.disconnect.push(handler);
  }

  /**
   * Register handler for reconnection event
   */
  onReconnect(handler: () => void): void {
    this.eventHandlers.reconnect.push(handler);
  }

  /**
   * Register handler for message event
   */
  onMessage(handler: (topic: string, message: StreamMessage) => void): void {
    this.eventHandlers.message.push(handler);
  }

  /**
   * Register handler for error event
   */
  onError(handler: (error: Error) => void): void {
    this.eventHandlers.error.push(handler);
  }

  /**
   * Get MQTT credentials from OAuth tokens
   */
  private async getMqttCredentials(): Promise<MqttCredentials> {
    try {
      const token = await this.authProvider.getToken();

      if (!token.gcid) {
        throw new AuthenticationError('Missing gcid in OAuth token', 'MISSING_GCID');
      }

      if (!token.idToken) {
        throw new AuthenticationError('Missing id_token in OAuth token', 'MISSING_ID_TOKEN');
      }

      return {
        username: token.gcid,
        password: token.idToken,
        clientId: this.generateClientId(),
        gcid: token.gcid,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Failed to get MQTT credentials', err);
      throw error;
    }
  }

  /**
   * Generate stable client ID
   *
   * Client ID is generated based on VIN hash to ensure:
   * - Idempotent: same VIN always generates same client ID
   * - Unique: different VINs generate different client IDs
   * - Anonymous: VIN not directly exposed in client ID
   */
  private generateClientId(): string {
    if (this.vin) {
      // Use VIN-based client ID (stable across reconnections)
      const hash = createHash('sha256').update(this.vin).digest('hex').substring(0, 16);
      return `${this.options.clientIdPrefix}${hash}`;
    } else {
      // Fallback: use random UUID (not stable across reconnections)
      const randomId = Math.random().toString(36).substring(2, 18);
      return `${this.options.clientIdPrefix}${randomId}`;
    }
  }

  /**
   * Setup MQTT client event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Connection established
    this.client.on('connect', () => {
      this.connectionState = 'connected';
      this.isReconnecting = false;
      this.logger?.info('MQTT connected');
      this.emitEvent('connect');
    });

    // Connection closed
    this.client.on('close', () => {
      if (this.connectionState !== 'disconnected') {
        this.connectionState = 'reconnecting';
        this.logger?.info('MQTT connection closed, reconnecting');
        this.emitEvent('disconnect');
      }
    });

    // Reconnection attempt
    this.client.on('reconnect', () => {
      this.connectionState = 'reconnecting';
      this.logger?.debug('MQTT reconnect attempt');
      this.emitEvent('reconnect');
    });

    // Message received
    this.client.on('message', (topic: string, payload: Buffer) => {
      this.handleMessage(topic, payload);
    });

    // Error occurred
    this.client.on('error', (error: Error) => {
      // Check if this is an authentication error
      const isAuthError =
        error.message.includes('Bad username or password') ||
        error.message.includes('Not authorized') ||
        error.message.includes('Connection refused');

      if (isAuthError && !this.isReconnecting) {
        this.logger?.warn('MQTT authentication error, refreshing token', { error: error.message });
        void this.handleAuthError();
      } else {
        this.logger?.error('MQTT error', error);
        this.connectionState = 'error';
        this.emitEvent('error', error);
      }
    });

    // Connection lost
    this.client.on('offline', () => {
      this.connectionState = 'reconnecting';
      this.logger?.debug('MQTT offline, will reconnect');
    });
  }

  /**
   * Handle authentication error by refreshing token and reconnecting
   */
  private async handleAuthError(): Promise<void> {
    if (this.isReconnecting) {
      this.logger?.debug('Already handling auth error, skipping');
      return;
    }

    this.isReconnecting = true;

    try {
      // Store active subscriptions before disconnecting
      const activeSubscriptions = Array.from(this.subscriptions.entries());

      // Disconnect current client (with stale credentials)
      await this.disconnect();

      // Force token refresh
      await this.authProvider.getToken();

      // Wait a bit before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Reconnect with fresh credentials
      await this.connect();

      // Re-subscribe to topics
      for (const [topic, qos] of activeSubscriptions) {
        try {
          await this.subscribe(topic, qos);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger?.error('Failed to re-subscribe after token refresh', err, { topic });
        }
      }

      this.logger?.info('MQTT reconnected with refreshed token', {
        subscriptions: activeSubscriptions.length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('MQTT token refresh failed', err);
      this.connectionState = 'error';
      this.emitEvent('error', err);
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Handle incoming MQTT message
   */
  private handleMessage(topic: string, payload: Buffer): void {
    try {
      // Parse and validate message
      const message = StreamMessageValidator.parse(payload);

      // Check if message is fresh
      if (!StreamMessageValidator.isMessageFresh(message)) {
        this.logger?.warn('Stale MQTT message received', {
          topic,
          timestamp: message.timestamp,
        });
        // Still emit the message, let consumer decide what to do
      }

      // Emit message event
      this.emitEvent('message', topic, message);
    } catch (error) {
      const err =
        error instanceof Error ? error : new ValidationError('Failed to parse MQTT message');
      this.logger?.error('Invalid MQTT message', err, { topic, payload: payload.toString() });
      this.emitEvent('error', err);
    }
  }

  /**
   * Wait for connection to be established
   */
  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('MQTT client not available'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new TimeoutError('MQTT connection timeout', this.options.connectTimeout));
      }, this.options.connectTimeout);

      const onConnect = () => {
        clearTimeout(timeout);
        this.client?.off('error', onError);
        resolve();
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        this.client?.off('connect', onConnect);
        reject(new NetworkError('MQTT connection failed', error));
      };

      this.client.once('connect', onConnect);
      this.client.once('error', onError);
    });
  }

  /**
   * Emit event to all registered handlers
   */
  private emitEvent(event: 'connect'): void;
  private emitEvent(event: 'reconnect'): void;
  private emitEvent(event: 'disconnect', error?: Error): void;
  private emitEvent(event: 'message', topic: string, message: StreamMessage): void;
  private emitEvent(event: 'error', error: Error): void;
  private emitEvent(event: keyof EventHandlers, ...args: unknown[]): void {
    const handlers = this.eventHandlers[event];

    for (const handler of handlers) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
        (handler as any)(...args);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger?.error('Error in event handler', err, { event });
      }
    }
  }
}
