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
  RECOVERY_RETRY_DELAYS,
  CREDENTIAL_RENEWAL,
  CLIENT_END_TIMEOUT,
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
  expiresAt: number; // expiry of the token the credentials come from (Unix seconds)
}

/**
 * What caused a reconnect with fresh credentials
 */
type RecoveryTrigger = 'auth-error' | 'renewal' | 'retry';

/**
 * Event handler map
 */
type EventHandlers = {
  connect: (() => void)[];
  disconnect: ((error?: Error) => void)[];
  reconnect: (() => void)[];
  message: ((topic: string, message: StreamMessage) => void)[];
  error: ((error: Error) => void)[];
  stateChange: ((state: ConnectionState) => void)[];
};

/**
 * MQTT Stream Client for BMW CarData API
 *
 * The broker password is the OAuth id_token, which expires after roughly an hour while mqtt.js
 * keeps reconnecting with the original password. The client therefore keeps the stream alive on
 * its own:
 * - Proactive renewal: after every successful connect it schedules a reconnect with fresh
 *   credentials shortly before the token used for that connection expires.
 * - Auth recovery: if the broker rejects the credentials anyway, it reconnects with fresh ones.
 * - Backoff: if such a reconnect fails, it is retried (see RECOVERY_RETRY_DELAYS) until it
 *   succeeds or the owner calls disconnect().
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
  private isReconnecting: boolean; // A recovery (reconnect with fresh credentials) is running
  private stoppedByOwner: boolean; // disconnect() was called and connect() has not been since
  private session: number; // Bumped by disconnect(); in-flight work compares it to notice that
  private retryAttempt: number; // Failed recoveries since the last successful (re)connect
  private renewalTimer?: ReturnType<typeof setTimeout>; // Proactive credential renewal
  private retryTimer?: ReturnType<typeof setTimeout>; // Backoff before the next recovery attempt
  private abortConnectWait?: () => void; // Rejects the connect attempt currently being awaited

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
      stateChange: [],
    };
    this.isReconnecting = false;
    this.stoppedByOwner = false;
    this.session = 0;
    this.retryAttempt = 0;
  }

  /**
   * Connect to MQTT broker
   *
   * On failure the half-created mqtt.js client is ended (so it cannot keep reconnecting in the
   * background with stale credentials) and the error is rethrown; the caller decides whether to
   * try again. On success credential renewal is scheduled.
   */
  async connect(): Promise<void> {
    if (this.client?.connected) {
      return;
    }

    // An explicit connect() supersedes the owner's earlier disconnect() and any pending timers
    this.stoppedByOwner = false;
    this.clearRenewalTimer();
    this.clearRetryTimer();
    const session = this.session;

    this.logger?.info('Connecting to MQTT broker', {
      broker: this.options.broker,
      port: this.options.port,
    });

    this.setConnectionState('connecting');

    try {
      // Replace a leftover client (e.g. one mqtt.js is still trying to reconnect)
      await this.teardownClient();

      const expiresAt = await this.establishConnection(session);
      this.throwIfCancelled(session);

      this.setConnectionState('connected');
      this.retryAttempt = 0;
      this.scheduleRenewal(expiresAt);
    } catch (error) {
      // A connect aborted by the owner's disconnect() stays 'disconnected'
      if (session === this.session) {
        this.setConnectionState('error');
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger?.error('Failed to connect to MQTT broker', err);
      throw error;
    }
  }

  /**
   * Disconnect from MQTT broker
   *
   * This is the owner stopping the client: it cancels credential renewal, any pending recovery
   * retry and any recovery or connect attempt in flight. Nothing reconnects afterwards until
   * connect() is called again.
   */
  async disconnect(): Promise<void> {
    this.stoppedByOwner = true;
    this.session += 1;
    this.clearRenewalTimer();
    this.clearRetryTimer();
    this.retryAttempt = 0;
    this.abortConnectWait?.();
    this.setConnectionState('disconnected');

    const client = this.client;
    if (!client) {
      return;
    }

    this.logger?.info('Disconnecting from MQTT broker');

    // Graceful DISCONNECT only makes sense on an established connection
    await this.endClient(client, !client.connected);
    if (this.client === client) {
      this.client = undefined;
    }
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
   * Register handler for connection state changes
   *
   * Called every time the state actually changes value, never twice in a row with the same one.
   */
  onStateChange(handler: (state: ConnectionState) => void): void {
    this.eventHandlers.stateChange.push(handler);
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
        expiresAt: token.expiresAt,
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
   * Create an mqtt.js client with the given credentials, wait for the broker to accept it and
   * make it the current client.
   *
   * Does not touch the connection state, the owner-facing parts of connect() and the recovery
   * routine each do that in their own way. If the connection cannot be established the
   * half-created mqtt.js client is ended (force) and cleared before the error is rethrown, so
   * it cannot keep auto-reconnecting in the background.
   *
   * @param session - Value of this.session when the attempt started
   * @returns Expiry (Unix seconds) of the token the credentials were derived from
   */
  private async establishConnection(session: number): Promise<number> {
    // Get MQTT credentials from OAuth tokens
    const credentials = await this.getMqttCredentials();
    this.throwIfCancelled(session);

    // Store gcid for topic construction
    this.gcid = credentials.gcid;

    // Create MQTT client
    const brokerUrl = `${this.options.protocol}://${this.options.broker}:${this.options.port}`;

    const client = mqtt.connect(brokerUrl, {
      clientId: credentials.clientId,
      username: credentials.username,
      password: credentials.password,
      keepalive: this.options.keepalive,
      reconnectPeriod: this.options.reconnectPeriod,
      connectTimeout: this.options.connectTimeout,
      clean: this.options.clean,
      resubscribe: this.options.resubscribe,
    });
    this.client = client;

    // Register event handlers
    this.setupEventHandlers(client);

    try {
      // Wait for connection
      await this.waitForConnection(client);
    } catch (error) {
      await this.discardClient(client);
      throw error;
    }

    this.throwIfCancelled(session);
    return credentials.expiresAt;
  }

  /**
   * Setup MQTT client event handlers
   *
   * Events of a client that is no longer the current one (torn down, discarded after a failed
   * connect, replaced by a recovery) are ignored: they must not change state or trigger actions.
   */
  private setupEventHandlers(client: mqtt.MqttClient): void {
    const isCurrent = () => this.client === client;

    // Connection established
    client.on('connect', () => {
      if (!isCurrent()) return;
      this.setConnectionState('connected');
      this.logger?.info('MQTT connected');
      this.emitEvent('connect');
    });

    // Connection closed
    client.on('close', () => {
      if (!isCurrent() || this.connectionState === 'disconnected') return;
      this.markLinkDown();
      this.logger?.info('MQTT connection closed, reconnecting');
      this.emitEvent('disconnect');
    });

    // Reconnection attempt
    client.on('reconnect', () => {
      if (!isCurrent()) return;
      this.markLinkDown();
      this.logger?.debug('MQTT reconnect attempt');
      this.emitEvent('reconnect');
    });

    // Message received
    client.on('message', (topic: string, payload: Buffer) => {
      if (!isCurrent()) return;
      this.handleMessage(topic, payload);
    });

    // Error occurred
    client.on('error', (error: Error) => {
      if (!isCurrent()) {
        this.logger?.debug('Ignoring error from replaced MQTT client', { error: error.message });
        return;
      }

      // Check if this is an authentication error
      const isAuthError =
        error.message.includes('Bad username or password') ||
        error.message.includes('Not authorized') ||
        error.message.includes('Connection refused');

      // While connect() is in progress it reports the failure to its caller, which decides what
      // to do; recovery is only for a connection that was established before.
      const canRecover =
        !this.isReconnecting && !this.stoppedByOwner && this.connectionState !== 'connecting';

      if (isAuthError && canRecover) {
        this.logger?.warn('MQTT authentication error, refreshing token', { error: error.message });
        void this.recover('auth-error');
      } else {
        this.logger?.error('MQTT error', error);
        this.emitEvent('error', error);
      }
    });

    // Connection lost
    client.on('offline', () => {
      if (!isCurrent()) return;
      this.markLinkDown();
      this.logger?.debug('MQTT offline, will reconnect');
    });
  }

  /**
   * Record that the link to the broker is down and mqtt.js will try to bring it back
   *
   * Ignored while connect() is in progress ('connecting' wins until connect() settles) and after
   * the owner disconnected.
   */
  private markLinkDown(): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'disconnected') {
      return;
    }
    this.setConnectionState('reconnecting');
  }

  /**
   * Single place that assigns the connection state; emits to state handlers on actual changes
   */
  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) {
      return;
    }
    this.connectionState = state;
    this.emitEvent('stateChange', state);
  }

  /**
   * Reconnect with fresh credentials, retrying with backoff until it works
   *
   * Entry point for every recovery: broker rejected the credentials, the proactive renewal timer
   * fired, or a backoff retry came due. Only one recovery runs at a time; failures schedule the
   * next attempt, a success resets the backoff. An owner disconnect() abandons the recovery
   * silently.
   */
  private async recover(trigger: RecoveryTrigger): Promise<void> {
    if (this.stoppedByOwner) {
      return;
    }

    if (this.isReconnecting) {
      this.logger?.debug('Already recovering MQTT connection, skipping', { trigger });
      return;
    }

    this.isReconnecting = true;
    const session = this.session;

    // This attempt supersedes whatever was scheduled before it
    this.clearRenewalTimer();
    this.clearRetryTimer();

    try {
      await this.reconnectWithFreshCredentials(session, trigger);

      this.retryAttempt = 0;
      this.logger?.info('MQTT reconnected with fresh credentials', {
        trigger,
        subscriptions: this.subscriptions.size,
      });
    } catch (error) {
      if (session !== this.session) {
        this.logger?.debug('MQTT recovery abandoned, client was disconnected', { trigger });
        return;
      }

      // Never leave a half-recovered client (e.g. connected but not subscribed) behind
      await this.teardownClient();
      if (session !== this.session) {
        return;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      const retryInMs = this.scheduleRetry();
      this.logger?.error('MQTT recovery failed', err, { trigger, retryInMs });
      this.emitEvent('error', err);
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Tear down the current client, connect with fresh credentials and re-subscribe every topic
   *
   * Shared by auth recovery, proactive renewal and backoff retries. Any failure (including a
   * failed re-subscribe, which would leave a connected but silent stream) is thrown to recover().
   */
  private async reconnectWithFreshCredentials(
    session: number,
    trigger: RecoveryTrigger
  ): Promise<void> {
    // Subscriptions outlive the client, snapshot them before connecting again
    const activeSubscriptions = Array.from(this.subscriptions.entries());

    this.logger?.info('Reconnecting MQTT with fresh credentials', {
      trigger,
      subscriptions: activeSubscriptions.length,
    });
    this.setConnectionState('reconnecting');

    // Disconnect current client (stale or about-to-expire credentials)
    await this.teardownClient();
    this.throwIfCancelled(session);

    // Connect with fresh credentials; the auth provider refreshes the token when due
    const expiresAt = await this.establishConnection(session);

    // Re-subscribe to topics
    for (const [topic, qos] of activeSubscriptions) {
      this.throwIfCancelled(session);
      await this.subscribe(topic, qos);
    }

    this.throwIfCancelled(session);
    this.scheduleRenewal(expiresAt);
  }

  /**
   * Schedule the next recovery attempt according to the backoff schedule
   *
   * @returns Delay until the attempt (milliseconds)
   */
  private scheduleRetry(): number {
    const steps = RECOVERY_RETRY_DELAYS.STEPS;
    const delay =
      this.retryAttempt < steps.length ? steps[this.retryAttempt] : RECOVERY_RETRY_DELAYS.MAX;

    this.retryAttempt += 1;
    this.setConnectionState('reconnecting');

    this.clearRetryTimer();
    this.retryTimer = this.startBackgroundTimer(() => {
      this.retryTimer = undefined;
      void this.recover('retry');
    }, delay);

    return delay;
  }

  /**
   * Schedule a reconnect with fresh credentials shortly before the connection's token expires
   *
   * Fires at expiresAt minus the lead time (so the auth provider's refresh buffer triggers a real
   * refresh), but never sooner than the minimum delay from now.
   *
   * @param expiresAt - Expiry of the token used for the current connection (Unix seconds)
   */
  private scheduleRenewal(expiresAt: number): void {
    this.clearRenewalTimer();

    if (!Number.isFinite(expiresAt)) {
      this.logger?.warn('MQTT token expiry unknown, skipping proactive renewal', { expiresAt });
      return;
    }

    const untilLeadTime = expiresAt * 1000 - CREDENTIAL_RENEWAL.LEAD_TIME - Date.now();
    const delay = Math.min(
      Math.max(untilLeadTime, CREDENTIAL_RENEWAL.MIN_DELAY),
      CREDENTIAL_RENEWAL.MAX_DELAY
    );

    this.logger?.debug('Scheduling MQTT credential renewal', { inMs: delay });
    this.renewalTimer = this.startBackgroundTimer(() => {
      this.renewalTimer = undefined;
      this.logger?.info('Renewing MQTT credentials before token expiry');
      void this.recover('renewal');
    }, delay);
  }

  /**
   * Start a timer that does not keep the process alive on its own
   */
  private startBackgroundTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, delay);
    timer.unref?.();
    return timer;
  }

  /**
   * Cancel the proactive renewal timer
   */
  private clearRenewalTimer(): void {
    if (this.renewalTimer) {
      clearTimeout(this.renewalTimer);
      this.renewalTimer = undefined;
    }
  }

  /**
   * Cancel the pending recovery retry
   */
  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * Abort the current operation if the owner called disconnect() since it started
   */
  private throwIfCancelled(session: number): void {
    if (session !== this.session) {
      throw new Error('MQTT operation cancelled by disconnect()');
    }
  }

  /**
   * End the current mqtt.js client (force) and forget it, without changing the connection state
   *
   * Internal teardown, as opposed to the owner's disconnect(): it neither stops renewal nor
   * cancels retries, because it is part of the recovery that schedules them.
   */
  private async teardownClient(): Promise<void> {
    const client = this.client;
    if (!client) {
      return;
    }

    // Forget the client first so its closing events are recognised as stale
    this.client = undefined;
    await this.endClient(client, true);
  }

  /**
   * End a client that failed to connect (force) and forget it if it is still the current one
   */
  private async discardClient(client: mqtt.MqttClient): Promise<void> {
    if (this.client === client) {
      this.client = undefined;
    }
    await this.endClient(client, true);
  }

  /**
   * End an mqtt.js client, waiting for it to finish for a bounded time
   *
   * A client that never calls back must not block recovery forever.
   */
  private endClient(client: mqtt.MqttClient, force: boolean): Promise<void> {
    return new Promise((resolve) => {
      let finished = false;
      const timer = setTimeout(() => {
        this.logger?.warn('Timed out waiting for MQTT client to end');
        finish();
      }, CLIENT_END_TIMEOUT);
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve();
      };

      try {
        client.end(force, {}, finish);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger?.error('Failed to end MQTT client', err);
        finish();
      }
    });
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
   * Wait for the given client to be accepted by the broker
   *
   * Rejects on timeout, on a client error, or when the owner calls disconnect() meanwhile.
   */
  private waitForConnection(client: mqtt.MqttClient): Promise<void> {
    return new Promise((resolve, reject) => {
      const settle = () => {
        clearTimeout(timeout);
        client.off('connect', onConnect);
        client.off('error', onError);
        this.abortConnectWait = undefined;
      };

      const timeout = setTimeout(() => {
        settle();
        reject(new TimeoutError('MQTT connection timeout', this.options.connectTimeout));
      }, this.options.connectTimeout);

      const onConnect = () => {
        settle();
        resolve();
      };

      const onError = (error: Error) => {
        settle();
        reject(new NetworkError('MQTT connection failed', error));
      };

      client.once('connect', onConnect);
      client.once('error', onError);
      this.abortConnectWait = () => {
        settle();
        reject(new Error('MQTT connection attempt cancelled by disconnect()'));
      };
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
  private emitEvent(event: 'stateChange', state: ConnectionState): void;
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
