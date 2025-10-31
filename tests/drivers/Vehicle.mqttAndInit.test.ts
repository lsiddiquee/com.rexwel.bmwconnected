/**
 * Tests for Vehicle MQTT and Initialization Methods
 *
 * Tests:
 * - handleMqttMessage: MQTT message processing and state updates
 * - initializeCarDataClient: API client initialization
 * - initializeMqttStreaming: MQTT streaming setup
 */

import { Vehicle } from '../../drivers/Vehicle';
import { DeviceSettings } from '../../utils/DeviceSettings';
import { MqttStreamClient } from '../../lib/streaming/MqttStreamClient';
import { StreamMessage } from '../../lib/streaming/StreamMessage';
import { DeviceStateManager } from '../../utils/DeviceStateManager';
import { ILogger } from '../../lib/types/ILogger';
import { DeviceCodeAuthProvider } from '../../lib/auth/DeviceCodeAuthProvider';
import { CarDataClient } from '../../lib/api/CarDataClient';

// Mock dependencies
jest.mock('../../lib/streaming/MqttStreamClient');
jest.mock('../../lib/auth/DeviceCodeAuthProvider');
jest.mock('../../lib/api/CarDataClient');

describe('Vehicle MQTT and Initialization', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockHomey: any;
  let mockLogger: ILogger;
  let mockStateManager: jest.Mocked<DeviceStateManager>;
  let mockAuthProvider: jest.Mocked<DeviceCodeAuthProvider>;
  let mockCarDataClient: jest.Mocked<CarDataClient>;
  let mockMqttClient: jest.Mocked<MqttStreamClient>;

  beforeEach(() => {
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
    };

    // Create mock Homey
    mockHomey = {
      settings: {
        get: jest.fn(),
        set: jest.fn(),
      },
      flow: {
        getDeviceTriggerCard: jest.fn(),
      },
    };

    // Create mock state manager
    mockStateManager = {
      updateFromMqttMessage: jest.fn(),
      getVehicleStatus: jest.fn().mockReturnValue({
        vin: 'TEST_VIN_123',
        driveTrain: 'ELECTRIC',
        lastUpdatedAt: new Date(),
      }),
      clearCache: jest.fn(),
      getLastLocation: jest.fn().mockReturnValue(null),
      getLastTripCompleteLocation: jest.fn().mockReturnValue(null),
      getLastTripCompleteMileage: jest.fn().mockReturnValue(0),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      setLastTripCompleteLocation: jest.fn().mockResolvedValue(undefined),
      setLastTripCompleteMileage: jest.fn().mockResolvedValue(undefined),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      setClientId: jest.fn().mockResolvedValue(undefined),
      setContainerId: jest.fn().mockResolvedValue(undefined),
      getDriveTrain: jest.fn().mockReturnValue('ELECTRIC'),
      setDriveTrain: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create mock auth provider
    mockAuthProvider = {
      getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    } as any;

    // Create mock CarData client
    mockCarDataClient = {
      getTelematicData: jest.fn(),
    } as any;

    // Create mock MQTT client
    mockMqttClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      onConnect: jest.fn(),
      onDisconnect: jest.fn(),
      onError: jest.fn(),
      onReconnect: jest.fn(),
      onMessage: jest.fn(),
    } as any;

    // Setup MqttStreamClient mock constructor
    (MqttStreamClient as jest.Mock).mockImplementation(() => mockMqttClient);

    // Create mock app with auth provider and API client
    mockApp = {
      logger: mockLogger,
      currentLocation: { latitude: 0, longitude: 0, label: '', address: '' },
      getAuthProvider: jest.fn().mockReturnValue(mockAuthProvider),
      getApiClient: jest.fn().mockReturnValue(mockCarDataClient),
    };

    // Create Vehicle instance bypassing constructor
    vehicle = Object.create(Vehicle.prototype);
    vehicle.app = mockApp;
    vehicle.logger = mockLogger;
    vehicle.homey = mockHomey;
    vehicle.deviceData = { id: 'TEST_VIN_123' };
    vehicle.settings = new DeviceSettings();
    vehicle['stateManager'] = mockStateManager;
    vehicle['_authProvider'] = undefined;
    vehicle['_carDataClient'] = undefined;
    vehicle['_mqttClient'] = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMqttMessage', () => {
    it('should_updateStateManager_when_validMessageReceived', async () => {
      // Arrange
      const mockMessage: StreamMessage = {
        timestamp: '2025-01-15T10:00:00Z',
        data: {
          'telematic.fuel_level': { value: 75, unit: '%', timestamp: '2025-01-15T10:00:00Z' },
        },
      } as any;

      // Act
      await vehicle['handleMqttMessage']('gcid/TEST_VIN_123', mockMessage);

      // Assert
      expect(mockStateManager.updateFromMqttMessage).toHaveBeenCalledWith(mockMessage);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should_handleError_when_updateFromMqttMessageThrows', async () => {
      // Arrange
      const mockError = new Error('State update failed');
      mockStateManager.updateFromMqttMessage.mockImplementation(() => {
        throw mockError;
      });

      const mockMessage: StreamMessage = {
        timestamp: '2025-01-15T10:00:00Z',
        data: {},
      } as any;

      // Act
      await vehicle['handleMqttMessage']('gcid/TEST_VIN_123', mockMessage);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to handle MQTT message: Error: State update failed'
      );
    });

    it('should_notThrow_when_stateManagerThrowsNonErrorObject', async () => {
      // Arrange
      mockStateManager.updateFromMqttMessage.mockImplementation(() => {
        throw 'String error';
      });

      const mockMessage: StreamMessage = {
        timestamp: '2025-01-15T10:00:00Z',
        data: {},
      } as any;

      // Act & Assert
      await expect(
        vehicle['handleMqttMessage']('gcid/TEST_VIN_123', mockMessage)
      ).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to handle MQTT message: String error');
    });
  });

  describe('initializeCarDataClient', () => {
    it('should_initializeClient_when_clientIdExists', async () => {
      // Arrange
      mockStateManager.getClientId.mockReturnValue('test-client-id');

      // Act
      await vehicle['initializeCarDataClient']();

      // Assert
      expect(mockStateManager.getClientId).toHaveBeenCalled();
      expect(mockApp.getAuthProvider).toHaveBeenCalledWith('test-client-id');
      expect(mockApp.getApiClient).toHaveBeenCalledWith('test-client-id');
      expect(vehicle['_authProvider']).toBe(mockAuthProvider);
      expect(vehicle['_carDataClient']).toBe(mockCarDataClient);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing CarData API client for device TEST_VIN_123 with client ID test-client-id'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'CarData API client initialized for device TEST_VIN_123'
      );
    });

    it('should_logWarning_when_clientIdMissing', async () => {
      // Arrange
      mockStateManager.getClientId.mockReturnValue(undefined);

      // Act
      await vehicle['initializeCarDataClient']();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No client ID found in device store - authentication required via repair flow'
      );
      expect(mockApp.getAuthProvider).not.toHaveBeenCalled();
      expect(mockApp.getApiClient).not.toHaveBeenCalled();
      expect(vehicle['_authProvider']).toBeUndefined();
    });

    it('should_logWarning_when_clientIdNull', async () => {
      // Arrange
      mockStateManager.getClientId.mockReturnValue(undefined);

      // Act
      await vehicle['initializeCarDataClient']();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No client ID found in device store - authentication required via repair flow'
      );
      expect(vehicle['_authProvider']).toBeUndefined();
    });

    it('should_handleError_when_getAuthProviderThrows', async () => {
      // Arrange
      vehicle.getStoreValue = jest.fn().mockReturnValue('test-client-id');
      const mockError = new Error('Auth provider initialization failed');
      mockApp.getAuthProvider.mockImplementation(() => {
        throw mockError;
      });

      // Act
      await vehicle['initializeCarDataClient']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize CarData API client - device will require repair',
        mockError
      );
      expect(vehicle['_authProvider']).toBeUndefined();
    });

    it('should_handleNonErrorException_when_initializationFails', async () => {
      // Arrange
      vehicle.getStoreValue = jest.fn().mockReturnValue('test-client-id');
      mockApp.getAuthProvider.mockImplementation(() => {
        throw 'String error';
      });

      // Act
      await vehicle['initializeCarDataClient']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize CarData API client - device will require repair',
        undefined
      );
    });
  });

  describe('initializeMqttStreaming', () => {
    beforeEach(() => {
      vehicle['_authProvider'] = mockAuthProvider;
    });

    it('should_initializeStreaming_when_allPrerequisitesMet', async () => {
      // Arrange
      // Event handlers are tested in separate tests

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(MqttStreamClient).toHaveBeenCalledWith(
        mockAuthProvider,
        {},
        mockLogger,
        'TEST_VIN_123'
      );
      expect(mockMqttClient.connect).toHaveBeenCalled();
      expect(mockMqttClient.subscribe).toHaveBeenCalledWith('TEST_VIN_123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing MQTT streaming for vehicle TEST_VIN_123'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MQTT streaming initialized for vehicle TEST_VIN_123'
      );
      expect(vehicle['_mqttClient']).toBe(mockMqttClient);

      // Verify event handlers were registered
      expect(mockMqttClient.onConnect).toHaveBeenCalled();
      expect(mockMqttClient.onDisconnect).toHaveBeenCalled();
      expect(mockMqttClient.onError).toHaveBeenCalled();
      expect(mockMqttClient.onReconnect).toHaveBeenCalled();
      expect(mockMqttClient.onMessage).toHaveBeenCalled();
    });

    it('should_registerConnectHandler_that_logsMessage', async () => {
      // Arrange
      let connectCallback: (() => void) | undefined;
      mockMqttClient.onConnect.mockImplementation((cb) => {
        connectCallback = cb;
      });

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(connectCallback).toBeDefined();
      connectCallback!();
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT connected for vehicle TEST_VIN_123');
    });

    it('should_registerDisconnectHandler_that_logsMessage', async () => {
      // Arrange
      let disconnectCallback: (() => void) | undefined;
      mockMqttClient.onDisconnect.mockImplementation((cb) => {
        disconnectCallback = cb;
      });

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(disconnectCallback).toBeDefined();
      disconnectCallback!();
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT disconnected for vehicle TEST_VIN_123');
    });

    it('should_registerErrorHandler_that_logsError', async () => {
      // Arrange
      let errorCallback: ((error: Error) => void) | undefined;
      mockMqttClient.onError.mockImplementation((cb) => {
        errorCallback = cb;
      });

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(errorCallback).toBeDefined();
      const testError = new Error('Connection failed');
      errorCallback!(testError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'MQTT error for vehicle TEST_VIN_123: Connection failed'
      );
    });

    it('should_registerReconnectHandler_that_logsMessage', async () => {
      // Arrange
      let reconnectCallback: (() => void) | undefined;
      mockMqttClient.onReconnect.mockImplementation((cb) => {
        reconnectCallback = cb;
      });

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(reconnectCallback).toBeDefined();
      reconnectCallback!();
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT reconnecting for vehicle TEST_VIN_123');
    });

    it('should_registerMessageHandler_that_callsHandleMqttMessage', async () => {
      // Arrange
      let messageCallback: ((topic: string, message: StreamMessage) => void) | undefined;
      mockMqttClient.onMessage.mockImplementation((cb) => {
        messageCallback = cb;
      });

      // Spy on handleMqttMessage
      const handleMqttMessageSpy = jest
        .spyOn(vehicle as any, 'handleMqttMessage')
        .mockResolvedValue(undefined);

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(messageCallback).toBeDefined();
      const mockMessage: StreamMessage = {
        timestamp: '2025-01-15T10:00:00Z',
        data: {},
      } as any;
      messageCallback!('gcid/TEST_VIN_123', mockMessage);
      expect(handleMqttMessageSpy).toHaveBeenCalledWith('gcid/TEST_VIN_123', mockMessage);

      handleMqttMessageSpy.mockRestore();
    });

    it('should_logInfo_when_streamingDisabled', async () => {
      // Arrange
      vehicle.settings.streamingEnabled = false;

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT streaming disabled in settings');
      expect(MqttStreamClient).not.toHaveBeenCalled();
      expect(vehicle['_mqttClient']).toBeUndefined();
    });

    it('should_logWarning_when_authProviderNotInitialized', async () => {
      // Arrange
      vehicle['_authProvider'] = undefined;

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Auth provider not initialized - cannot start MQTT streaming'
      );
      expect(MqttStreamClient).not.toHaveBeenCalled();
      expect(vehicle['_mqttClient']).toBeUndefined();
    });

    it('should_handleError_when_mqttConnectFails', async () => {
      // Arrange
      const mockError = new Error('Connection failed');
      mockMqttClient.connect.mockRejectedValue(mockError);

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize MQTT streaming for vehicle TEST_VIN_123 - will use API polling',
        mockError
      );
    });

    it('should_handleNonErrorException_when_initializationFails', async () => {
      // Arrange
      mockMqttClient.connect.mockRejectedValue('String error');

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize MQTT streaming for vehicle TEST_VIN_123 - will use API polling',
        undefined
      );
    });

    it('should_handleError_when_mqttSubscribeFails', async () => {
      // Arrange
      const mockError = new Error('Subscribe failed');
      mockMqttClient.subscribe.mockRejectedValue(mockError);

      // Act
      await vehicle['initializeMqttStreaming']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize MQTT streaming for vehicle TEST_VIN_123 - will use API polling',
        mockError
      );
    });
  });
});
