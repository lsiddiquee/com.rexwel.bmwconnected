/**
 * Comprehensive tests for MqttStreamClient
 *
 * Tests:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Subscription management (subscribe, unsubscribe, resubscribe on reconnect)
 * - Message handling and validation
 * - Error handling (connection errors, auth errors, message parsing errors)
 * - Event handlers (connect, disconnect, reconnect, message, error)
 * - Authentication and token refresh
 */

import { MqttStreamClient } from '../../../lib/streaming/MqttStreamClient';
import { IAuthProvider } from '../../../lib/auth/IAuthProvider';
import { ILogger } from '../../../lib/types/ILogger';
import { AuthToken } from '../../../lib/models/AuthToken';
import * as mqtt from 'mqtt';
import { EventEmitter } from 'events';

// Mock mqtt module
jest.mock('mqtt');

describe('MqttStreamClient Comprehensive Tests', () => {
  let client: MqttStreamClient;
  let mockAuthProvider: jest.Mocked<IAuthProvider>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockMqttClient: EventEmitter & {
    connected: boolean;
    end: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let mockToken: AuthToken;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as any;

    // Create mock token
    mockToken = {
      gcid: 'test-gcid-123',
      idToken: 'test-id-token',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() / 1000 + 3600,
    };

    // Create mock auth provider
    mockAuthProvider = {
      getToken: jest.fn().mockResolvedValue(mockToken),
      refreshTokens: jest.fn().mockResolvedValue(mockToken),
      getValidAccessToken: jest.fn().mockResolvedValue('test-access-token'),
    } as any;

    // Create mock MQTT client
    mockMqttClient = Object.assign(new EventEmitter(), {
      connected: false,
      end: jest.fn((_force: boolean, _opts: any, callback?: () => void) => {
        mockMqttClient.connected = false;
        if (callback) callback();
      }),
      subscribe: jest.fn((_topic: string, _opts: any, callback?: (error: Error | null) => void) => {
        if (callback) callback(null);
      }),
      unsubscribe: jest.fn(
        (_topic: string, _opts: any, callback?: (error: Error | null) => void) => {
          if (callback) callback(null);
        }
      ),
    });

    // Mock mqtt.connect
    (mqtt.connect as jest.Mock).mockReturnValue(mockMqttClient);
  });

  afterEach(async () => {
    // Clean up event listeners
    mockMqttClient.removeAllListeners();

    // Disconnect client if it exists and is connected
    if (client && client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should_createClient_with_defaultOptions', () => {
      // Act
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');

      // Assert
      expect(client).toBeDefined();
      expect(client.getConnectionState()).toBe('disconnected');
      expect(client.isConnected()).toBe(false);
    });

    it('should_createClient_with_customOptions', () => {
      // Act
      client = new MqttStreamClient(
        mockAuthProvider,
        {
          broker: 'custom.broker.com',
          port: 8883,
          protocol: 'mqtts',
          keepalive: 120,
          reconnectPeriod: 5000,
        },
        mockLogger,
        'TEST_VIN_123'
      );

      // Assert
      expect(client).toBeDefined();
    });

    it('should_createClient_without_vin', () => {
      // Act
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger);

      // Assert
      expect(client).toBeDefined();
    });
  });

  describe('connect()', () => {
    beforeEach(() => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
    });

    it('should_connectSuccessfully_when_validCredentials', async () => {
      // Arrange
      const connectPromise = client.connect();

      // Simulate successful connection
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act & Assert
      await expect(connectPromise).resolves.toBeUndefined();
      expect(client.isConnected()).toBe(true);
      expect(client.getConnectionState()).toBe('connected');
      expect(mockAuthProvider.getToken).toHaveBeenCalled();
      expect(mqtt.connect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Connecting to MQTT broker', expect.any(Object));
    });

    it('should_notReconnect_when_alreadyConnected', async () => {
      // Arrange - First connect
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act - Try to connect again
      await client.connect(); // Second call should return immediately

      // Assert - mqtt.connect should only be called once
      expect(mqtt.connect).toHaveBeenCalledTimes(1);
    });

    it('should_throwError_when_missingGcid', async () => {
      // Arrange
      mockAuthProvider.getToken.mockResolvedValue({
        ...mockToken,
        gcid: undefined,
      } as any);

      // Act & Assert
      await expect(client.connect()).rejects.toThrow('Missing gcid in OAuth token');
      expect(client.getConnectionState()).toBe('error');
    });

    it('should_throwError_when_missingIdToken', async () => {
      // Arrange
      mockAuthProvider.getToken.mockResolvedValue({
        ...mockToken,
        idToken: undefined,
      } as any);

      // Act & Assert
      await expect(client.connect()).rejects.toThrow('Missing id_token in OAuth token');
      expect(client.getConnectionState()).toBe('error');
    });

    it('should_throwTimeoutError_when_connectionTimeout', async () => {
      // Arrange
      client = new MqttStreamClient(
        mockAuthProvider,
        { connectTimeout: 100 },
        mockLogger,
        'TEST_VIN_123'
      );

      // Act
      const connectPromise = client.connect();

      // Don't emit 'connect' event to trigger timeout

      // Assert
      await expect(connectPromise).rejects.toThrow('MQTT connection timeout');
      expect(client.getConnectionState()).toBe('error');
    });

    it('should_throwNetworkError_when_connectionFails', async () => {
      // Arrange
      const connectPromise = client.connect();

      // Simulate connection error
      process.nextTick(() => {
        mockMqttClient.emit('error', new Error('Connection refused'));
      });

      // Act & Assert
      await expect(connectPromise).rejects.toThrow('MQTT connection failed');
      expect(client.getConnectionState()).toBe('error');
    });

    it('should_generateStableClientId_when_vinProvided', async () => {
      // Arrange
      const connectPromise = client.connect();

      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act
      await connectPromise;

      // Assert
      const connectCall = (mqtt.connect as jest.Mock).mock.calls[0];
      const options = connectCall[1];
      expect(options.clientId).toMatch(/^homey-bmw-/);
      expect(options.clientId.length).toBe(26); // "homey-bmw-" (10 chars) + 16 char hash
    });

    it('should_generateRandomClientId_when_vinNotProvided', async () => {
      // Arrange
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger); // No VIN
      const connectPromise = client.connect();

      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act
      await connectPromise;

      // Assert
      const connectCall = (mqtt.connect as jest.Mock).mock.calls[0];
      const options = connectCall[1];
      expect(options.clientId).toMatch(/^homey-bmw-/);
    });

    it('should_passCorrectCredentials_to_mqttConnect', async () => {
      // Arrange
      const connectPromise = client.connect();

      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act
      await connectPromise;

      // Assert
      const connectCall = (mqtt.connect as jest.Mock).mock.calls[0];
      const brokerUrl = connectCall[0];
      const options = connectCall[1];

      expect(brokerUrl).toBe('mqtts://customer.streaming-cardata.bmwgroup.com:9000');
      expect(options.username).toBe('test-gcid-123');
      expect(options.password).toBe('test-id-token');
      expect(options.keepalive).toBe(30); // Default from constants
      expect(options.reconnectPeriod).toBe(1000);
      expect(options.connectTimeout).toBe(30000);
      expect(options.clean).toBe(false);
      expect(options.resubscribe).toBe(true);
    });
  });

  describe('disconnect()', () => {
    beforeEach(async () => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;
    });

    it('should_disconnectSuccessfully_when_connected', async () => {
      // Act
      await client.disconnect();

      // Assert
      expect(mockMqttClient.end).toHaveBeenCalled();
      expect(client.getConnectionState()).toBe('disconnected');
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from MQTT broker');
    });

    it('should_doNothing_when_alreadyDisconnected', async () => {
      // Arrange
      await client.disconnect(); // First disconnect

      // Act
      await client.disconnect(); // Second disconnect

      // Assert
      expect(mockMqttClient.end).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('subscribe()', () => {
    beforeEach(async () => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;
    });

    it('should_subscribeSuccessfully_with_vin', async () => {
      // Act
      await client.subscribe('TEST_VIN_456');

      // Assert
      expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
        'test-gcid-123/TEST_VIN_456',
        { qos: 1 },
        expect.any(Function)
      );
      expect(client.getActiveSubscriptions()).toContain('test-gcid-123/TEST_VIN_456');
      expect(mockLogger.info).toHaveBeenCalledWith('Subscribed to MQTT topic', expect.any(Object));
    });

    it('should_subscribeSuccessfully_with_fullTopic', async () => {
      // Act
      await client.subscribe('test-gcid-123/TEST_VIN_456');

      // Assert
      expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
        'test-gcid-123/TEST_VIN_456',
        { qos: 1 },
        expect.any(Function)
      );
    });

    it('should_subscribeWith_customQos', async () => {
      // Act
      await client.subscribe('TEST_VIN_456', 2);

      // Assert
      expect(mockMqttClient.subscribe).toHaveBeenCalledWith(
        'test-gcid-123/TEST_VIN_456',
        { qos: 2 },
        expect.any(Function)
      );
    });

    it('should_throwError_when_notConnected', async () => {
      // Arrange
      mockMqttClient.connected = false;

      // Act & Assert
      await expect(client.subscribe('TEST_VIN_456')).rejects.toThrow('MQTT client not connected');
    });

    it('should_throwError_when_subscriptionFails', async () => {
      // Arrange
      mockMqttClient.subscribe.mockImplementation(
        (_topic: string, _opts: any, callback?: (error: Error | null) => void) => {
          if (callback) callback(new Error('Subscription failed'));
        }
      );

      // Act & Assert
      await expect(client.subscribe('TEST_VIN_456')).rejects.toThrow('Subscription failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to subscribe to MQTT topic',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('unsubscribe()', () => {
    beforeEach(async () => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;
      await client.subscribe('TEST_VIN_456');
    });

    it('should_unsubscribeSuccessfully', async () => {
      // Act
      await client.unsubscribe('test-gcid-123/TEST_VIN_456');

      // Assert
      expect(mockMqttClient.unsubscribe).toHaveBeenCalledWith(
        'test-gcid-123/TEST_VIN_456',
        {},
        expect.any(Function)
      );
      expect(client.getActiveSubscriptions()).not.toContain('test-gcid-123/TEST_VIN_456');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Unsubscribed from MQTT topic',
        expect.any(Object)
      );
    });

    it('should_throwError_when_notConnected', async () => {
      // Arrange
      mockMqttClient.connected = false;

      // Act & Assert
      await expect(client.unsubscribe('test-gcid-123/TEST_VIN_456')).rejects.toThrow(
        'MQTT client not connected'
      );
    });

    it('should_throwError_when_unsubscriptionFails', async () => {
      // Arrange
      mockMqttClient.unsubscribe.mockImplementation(
        (_topic: string, _opts: any, callback?: (error: Error | null) => void) => {
          if (callback) callback(new Error('Unsubscription failed'));
        }
      );

      // Act & Assert
      await expect(client.unsubscribe('test-gcid-123/TEST_VIN_456')).rejects.toThrow(
        'Unsubscription failed'
      );
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
    });

    it('should_triggerConnectHandler_when_connected', async () => {
      // Arrange
      const connectHandler = jest.fn();
      client.onConnect(connectHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act
      await connectPromise;

      // Assert
      expect(connectHandler).toHaveBeenCalled();
    });

    it('should_triggerDisconnectHandler_when_connectionClosed', async () => {
      // Arrange
      const disconnectHandler = jest.fn();
      client.onDisconnect(disconnectHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act
      mockMqttClient.emit('close');

      // Assert
      expect(disconnectHandler).toHaveBeenCalled();
      expect(client.getConnectionState()).toBe('reconnecting');
    });

    it('should_triggerReconnectHandler_when_reconnecting', async () => {
      // Arrange
      const reconnectHandler = jest.fn();
      client.onReconnect(reconnectHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act
      mockMqttClient.emit('reconnect');

      // Assert
      expect(reconnectHandler).toHaveBeenCalled();
      expect(client.getConnectionState()).toBe('reconnecting');
    });

    it('should_triggerErrorHandler_when_errorOccurs', async () => {
      // Arrange
      const errorHandler = jest.fn();
      client.onError(errorHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act
      const testError = new Error('Test error');
      mockMqttClient.emit('error', testError);

      // Assert
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should_triggerMessageHandler_when_validMessageReceived', async () => {
      // Arrange
      const messageHandler = jest.fn();
      client.onMessage(messageHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      const validMessage = {
        vin: 'AAAAAAAAAAAAAAAAA', // 17 character VIN
        entityId: '187d32c4-6ce2-470f-9f3d-81ba54bcc4da',
        topic: 'AAAAAAAAAAAAAAAAA',
        timestamp: new Date().toISOString(),
        data: {
          'vehicle.fuel_level': {
            timestamp: new Date().toISOString(),
            value: 75,
            unit: '%',
          },
        },
      };

      // Act
      mockMqttClient.emit('message', 'test-topic', Buffer.from(JSON.stringify(validMessage)));

      // Wait for async message processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(messageHandler).toHaveBeenCalledWith('test-topic', expect.any(Object));
    });

    it('should_triggerErrorHandler_when_invalidMessageReceived', async () => {
      // Arrange
      const errorHandler = jest.fn();
      client.onError(errorHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act
      mockMqttClient.emit('message', 'test-topic', Buffer.from('invalid json'));

      // Assert
      expect(errorHandler).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid MQTT message',
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('should_handleMultipleHandlers_forSameEvent', async () => {
      // Arrange
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      const handler3 = jest.fn();

      client.onConnect(handler1);
      client.onConnect(handler2);
      client.onConnect(handler3);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act
      await connectPromise;

      // Assert
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should_notCrash_when_handlerThrowsError', async () => {
      // Arrange
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      client.onConnect(errorHandler);

      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });

      // Act & Assert
      await expect(connectPromise).resolves.toBeUndefined();
      expect(errorHandler).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error in event handler', expect.any(Error), {
        event: 'connect',
      });
    });
  });

  describe('Authentication Error Handling', () => {
    beforeEach(() => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
    });

    it('should_refreshToken_when_authErrorOccurs', async () => {
      // Arrange
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Mock subscription
      await client.subscribe('TEST_VIN_456');

      // Act - Simulate auth error
      mockMqttClient.emit('error', new Error('Bad username or password'));

      // Wait for async token refresh
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MQTT authentication error, refreshing token',
        expect.any(Object)
      );
    });

    it('should_notRefreshToken_when_alreadyReconnecting', async () => {
      // Arrange
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act - Trigger multiple auth errors quickly
      mockMqttClient.emit('error', new Error('Not authorized'));
      mockMqttClient.emit('error', new Error('Not authorized'));

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert - Should only log once
      const warnCalls = (mockLogger.warn as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'MQTT authentication error, refreshing token'
      );
      expect(warnCalls.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Message Validation', () => {
    beforeEach(async () => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;
    });

    it('should_warnAboutStaleMessage_but_stillEmit', async () => {
      // Arrange
      const messageHandler = jest.fn();
      client.onMessage(messageHandler);

      const staleMessage = {
        vin: 'AAAAAAAAAAAAAAAAA', // 17 character VIN
        entityId: '187d32c4-6ce2-470f-9f3d-81ba54bcc4da',
        topic: 'AAAAAAAAAAAAAAAAA',
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes old
        data: {
          'vehicle.fuel_level': {
            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            value: 75,
            unit: '%',
          },
        },
      };

      // Act
      mockMqttClient.emit('message', 'test-topic', Buffer.from(JSON.stringify(staleMessage)));

      // Wait for async message processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Stale MQTT message received',
        expect.any(Object)
      );
      expect(messageHandler).toHaveBeenCalled(); // Still emitted
    });
  });

  describe('getActiveSubscriptions()', () => {
    beforeEach(async () => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;
    });

    it('should_returnEmptyArray_when_noSubscriptions', () => {
      // Act
      const subscriptions = client.getActiveSubscriptions();

      // Assert
      expect(subscriptions).toEqual([]);
    });

    it('should_returnAllActiveSubscriptions', async () => {
      // Arrange
      await client.subscribe('TEST_VIN_456');
      await client.subscribe('TEST_VIN_789');

      // Act
      const subscriptions = client.getActiveSubscriptions();

      // Assert
      expect(subscriptions).toContain('test-gcid-123/TEST_VIN_456');
      expect(subscriptions).toContain('test-gcid-123/TEST_VIN_789');
      expect(subscriptions).toHaveLength(2);
    });

    it('should_removeFromList_after_unsubscribe', async () => {
      // Arrange
      await client.subscribe('TEST_VIN_456');
      await client.subscribe('TEST_VIN_789');
      await client.unsubscribe('test-gcid-123/TEST_VIN_456');

      // Act
      const subscriptions = client.getActiveSubscriptions();

      // Assert
      expect(subscriptions).not.toContain('test-gcid-123/TEST_VIN_456');
      expect(subscriptions).toContain('test-gcid-123/TEST_VIN_789');
      expect(subscriptions).toHaveLength(1);
    });
  });

  describe('Connection State Management', () => {
    beforeEach(() => {
      client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
    });

    it('should_updateState_during_connectionLifecycle', async () => {
      // Initial state
      expect(client.getConnectionState()).toBe('disconnected');

      // Start connecting
      const connectPromise = client.connect();
      expect(client.getConnectionState()).toBe('connecting');

      // Connected
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;
      expect(client.getConnectionState()).toBe('connected');

      // Disconnected
      mockMqttClient.emit('close');
      expect(client.getConnectionState()).toBe('reconnecting');
    });

    it('should_setErrorState_when_connectionFails', async () => {
      // Arrange
      const connectPromise = client.connect();

      process.nextTick(() => {
        mockMqttClient.emit('error', new Error('Connection failed'));
      });

      // Act & Assert
      await expect(connectPromise).rejects.toThrow();
      expect(client.getConnectionState()).toBe('error');
    });

    it('should_setOfflineState_when_networkLost', async () => {
      // Arrange
      const connectPromise = client.connect();
      process.nextTick(() => {
        mockMqttClient.connected = true;
        mockMqttClient.emit('connect');
      });
      await connectPromise;

      // Act
      mockMqttClient.emit('offline');

      // Assert
      expect(client.getConnectionState()).toBe('reconnecting');
      expect(mockLogger.debug).toHaveBeenCalledWith('MQTT offline, will reconnect');
    });
  });
});
