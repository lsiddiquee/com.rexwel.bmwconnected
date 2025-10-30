/**
 * Comprehensive Unit Tests for DeviceStateManager
 *
 * Tests uncovered functionality to improve coverage from 57.42% to 85%+:
 * - MQTT batching logic and delegate callbacks
 * - Initialization methods and error handling
 * - Metadata and settings access
 * - Cache management operations
 * - Error scenarios and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DeviceStateManager, type StateUpdateDelegate } from '../../utils/DeviceStateManager';
import type { TelematicDataPoint, VehicleStatus } from '../../lib/models';
import type { IVehicleClient } from '../../lib/client/IVehicleClient';
import type { ILogger } from '../../lib/types/ILogger';
import type { StreamMessage } from '../../lib/streaming';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import type Homey from 'homey';

describe('DeviceStateManager - Comprehensive Tests', () => {
  let mockDevice: jest.Mocked<Homey.Device>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockCarDataClient: jest.Mocked<IVehicleClient>;
  let stateManager: DeviceStateManager;
  let mockStore: Record<string, unknown>;
  let stateUpdateDelegate: jest.MockedFunction<StateUpdateDelegate>;

  beforeEach(() => {
    // Fresh mock store for each test
    mockStore = {};

    // Mock device with store access
    mockDevice = {
      getStoreValue: jest
        .fn<(key: string) => unknown>()
        .mockImplementation((key: string) => mockStore[key]),
      setStoreValue: jest
        .fn<(key: string, value: unknown) => Promise<void>>()
        .mockImplementation((key: string, value: unknown) => {
          // Deep clone to simulate Homey's serialization
          mockStore[key] = JSON.parse(JSON.stringify(value));
          return Promise.resolve();
        }),
      getSettings: jest.fn(),
    } as any;

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as any;

    // Mock CarData client
    mockCarDataClient = {
      getVehicleStatus: jest.fn(),
      getRawTelematicData: jest.fn(),
    } as any;

    // Mock state update delegate
    stateUpdateDelegate = jest.fn<StateUpdateDelegate>();

    // Create state manager with delegate
    stateManager = new DeviceStateManager(mockDevice, mockLogger, stateUpdateDelegate);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should_initializeStore_when_notAlreadyInitialized', async () => {
      // Arrange
      const mockStatus: VehicleStatus = {
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-01-01T12:00:00Z'),
        currentMileage: 10000,
      };
      mockCarDataClient.getVehicleStatus.mockResolvedValue(mockStatus);

      // Act
      const result = await stateManager.initialize(mockCarDataClient, 'TEST_VIN_123');

      // Assert
      expect(mockCarDataClient.getVehicleStatus).toHaveBeenCalledWith('TEST_VIN_123');
      expect(mockDevice.setStoreValue).toHaveBeenCalledWith(
        'deviceState',
        expect.objectContaining({
          vin: 'TEST_VIN_123',
          driveTrain: DriveTrainType.ELECTRIC,
          telematicCache: {},
          lastApiUpdate: null,
          lastMqttUpdate: null,
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          vin: 'TEST_VIN_123',
          driveTrain: DriveTrainType.ELECTRIC,
        })
      ); // Returns getVehicleStatus() result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Initializing device store - fetching VIN and drive train from API'
      );
    });

    it('should_seedCache_when_containerIdProvided', async () => {
      // Arrange
      const mockStatus: VehicleStatus = {
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-01-01T12:00:00Z'),
        currentMileage: 10000,
      };
      const mockTelematicData: Record<string, TelematicDataPoint> = {
        'vehicle.fuel_level': {
          timestamp: '2025-01-01T12:00:00Z',
          value: 75,
          unit: '%',
        },
      };

      mockCarDataClient.getVehicleStatus.mockResolvedValue(mockStatus);
      mockCarDataClient.getRawTelematicData.mockResolvedValue(mockTelematicData);

      // Act
      const result = await stateManager.initialize(
        mockCarDataClient,
        'TEST_VIN_123',
        'container123'
      );

      // Assert
      expect(mockCarDataClient.getRawTelematicData).toHaveBeenCalledWith(
        'TEST_VIN_123',
        'container123'
      );
      expect(result).toEqual(
        expect.objectContaining({
          vin: 'TEST_VIN_123',
          driveTrain: DriveTrainType.ELECTRIC,
        })
      );
    });

    it('should_skipInitialization_when_alreadyInitialized', async () => {
      // Arrange - Pre-populate store
      mockStore.deviceState = {
        vin: 'EXISTING_VIN',
        driveTrain: DriveTrainType.COMBUSTION,
        telematicCache: {},
        lastApiUpdate: null,
        lastMqttUpdate: null,
      };

      // Act
      const result = await stateManager.initialize(mockCarDataClient, 'TEST_VIN_123');

      // Assert
      expect(mockCarDataClient.getVehicleStatus).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          vin: 'EXISTING_VIN',
          driveTrain: DriveTrainType.COMBUSTION,
        })
      ); // Returns getVehicleStatus() result
    });

    it('should_handleError_when_initializationFails', async () => {
      // Arrange
      const error = new Error('API failure');
      mockCarDataClient.getVehicleStatus.mockRejectedValue(error);

      // Act & Assert
      await expect(stateManager.initialize(mockCarDataClient, 'TEST_VIN_123')).rejects.toThrow(
        'API failure'
      );
      // Note: No logger.error call expected as getVehicleStatus fails before error handling
    });
  });

  describe('MQTT Batching', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Pre-initialize store
      mockStore.deviceState = {
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        telematicCache: {},
        lastApiUpdate: null,
        lastMqttUpdate: null,
      };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should_batchMqttMessages_when_receivedWithin1Second', async () => {
      // Arrange
      const message1: StreamMessage = {
        vin: 'TEST_VIN_123',
        entityId: 'entity1',
        topic: 'TEST_VIN_123',
        timestamp: '2025-01-01T12:00:00Z',
        data: {
          'vehicle.fuel_level': {
            timestamp: '2025-01-01T12:00:00Z',
            value: 75,
            unit: '%',
          },
        },
      };

      const message2: StreamMessage = {
        vin: 'TEST_VIN_123',
        entityId: 'entity2',
        topic: 'TEST_VIN_123',
        timestamp: '2025-01-01T12:00:01Z',
        data: {
          'vehicle.battery_level': {
            timestamp: '2025-01-01T12:00:01Z',
            value: 80,
            unit: '%',
          },
        },
      };

      // Act
      const result1 = stateManager.updateFromMqttMessage(message1);
      const result2 = stateManager.updateFromMqttMessage(message2);

      // Assert - Should return existing status before batch processing
      expect(result1).toEqual(
        expect.objectContaining({
          vin: 'TEST_VIN_123',
        })
      );
      expect(result2).toEqual(
        expect.objectContaining({
          vin: 'TEST_VIN_123',
        })
      );

      // Advance timer to trigger batch processing
      jest.advanceTimersByTime(1000);

      // Run all timers and promises
      await jest.runAllTimersAsync();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Batch updating state from MQTT messages', {
        vin: 'TEST_VIN_123',
        batchCount: 2,
        keysCount: 2,
      });
      expect(stateUpdateDelegate).toHaveBeenCalledWith(
        expect.objectContaining({
          vin: 'TEST_VIN_123',
        })
      );
    });

    it('should_handleDelegateError_when_delegateThrows', async () => {
      // Arrange
      stateUpdateDelegate.mockImplementation(() => Promise.reject(new Error('Delegate error')));

      const message: StreamMessage = {
        vin: 'TEST_VIN_123',
        entityId: 'entity1',
        topic: 'TEST_VIN_123',
        timestamp: '2025-01-01T12:00:00Z',
        data: {
          'vehicle.fuel_level': {
            timestamp: '2025-01-01T12:00:00Z',
            value: 75,
            unit: '%',
          },
        },
      };

      // Act
      stateManager.updateFromMqttMessage(message);
      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith('State update delegate threw error', {
        error: expect.any(Error),
      });
    });

    it('should_mergeDataPoints_when_sameKeyInBatch', async () => {
      // Arrange
      const message1: StreamMessage = {
        vin: 'TEST_VIN_123',
        entityId: 'entity1',
        topic: 'TEST_VIN_123',
        timestamp: '2025-01-01T12:00:00Z',
        data: {
          'vehicle.fuel_level': {
            timestamp: '2025-01-01T12:00:00Z',
            value: 75,
            unit: '%',
          },
        },
      };

      const message2: StreamMessage = {
        vin: 'TEST_VIN_123',
        entityId: 'entity2',
        topic: 'TEST_VIN_123',
        timestamp: '2025-01-01T12:00:01Z',
        data: {
          'vehicle.fuel_level': {
            timestamp: '2025-01-01T12:00:01Z',
            value: 80, // Later value should win
            unit: '%',
          },
        },
      };

      // Act
      stateManager.updateFromMqttMessage(message1);
      stateManager.updateFromMqttMessage(message2);
      jest.advanceTimersByTime(1000);
      await jest.runAllTimersAsync();

      // Assert - The merged data should have the later value (80)
      expect(mockDevice.setStoreValue).toHaveBeenCalledWith(
        'deviceState',
        expect.objectContaining({
          telematicCache: expect.objectContaining({
            'vehicle.fuel_level': expect.objectContaining({
              value: 80,
            }),
          }),
        })
      );
    });

    it('should_returnCurrentStatus_immediately', () => {
      // Arrange
      const message: StreamMessage = {
        vin: 'TEST_VIN_123',
        entityId: 'entity1',
        topic: 'TEST_VIN_123',
        timestamp: '2025-01-01T12:00:00Z',
        data: {
          'vehicle.fuel_level': {
            timestamp: '2025-01-01T12:00:00Z',
            value: 75,
            unit: '%',
          },
        },
      };

      // Act
      const result = stateManager.updateFromMqttMessage(message);

      // Assert - Should return immediately, not wait for batch
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('Metadata and Settings', () => {
    beforeEach(() => {
      // Pre-populate store with metadata
      mockStore.deviceState = {
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        telematicCache: {},
        lastApiUpdate: '2025-01-01T10:00:00Z',
        lastMqttUpdate: '2025-01-01T11:00:00Z',
      };
    });

    it('should_returnUpdateMetadata_when_called', () => {
      // Act
      const metadata = stateManager.getUpdateMetadata();

      // Assert
      expect(metadata).toEqual({
        lastApiUpdate: '2025-01-01T10:00:00Z',
        lastMqttUpdate: '2025-01-01T11:00:00Z',
      });
    });

    it('should_returnStreamingEnabled_when_settingTrue', () => {
      // Arrange
      mockDevice.getSettings.mockReturnValue({ streamingEnabled: true });

      // Act
      const result = stateManager.isStreamingEnabled();

      // Assert
      expect(result).toBe(true);
      expect(mockDevice.getSettings).toHaveBeenCalled();
    });

    it('should_returnStreamingDisabled_when_settingFalse', () => {
      // Arrange
      mockDevice.getSettings.mockReturnValue({ streamingEnabled: false });

      // Act
      const result = stateManager.isStreamingEnabled();

      // Assert
      expect(result).toBe(false);
    });

    it('should_defaultToTrue_when_streamingSettingUndefined', () => {
      // Arrange
      mockDevice.getSettings.mockReturnValue({});

      // Act
      const result = stateManager.isStreamingEnabled();

      // Assert
      expect(result).toBe(true); // Default value
    });

    it('should_returnTelematicCache_when_called', () => {
      // Arrange
      const mockCache = {
        'vehicle.fuel_level': {
          timestamp: '2025-01-01T12:00:00Z',
          value: 75,
          unit: '%',
        },
      };
      mockStore.deviceState = {
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        telematicCache: mockCache,
        lastApiUpdate: null,
        lastMqttUpdate: null,
      };

      // Act
      const result = stateManager.getTelematicCache();

      // Assert
      expect(result).toEqual(mockCache);
    });
  });

  describe('Cache Management', () => {
    beforeEach(() => {
      // Pre-populate store with data
      mockStore.deviceState = {
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        telematicCache: {
          'vehicle.fuel_level': {
            timestamp: '2025-01-01T12:00:00Z',
            value: 75,
            unit: '%',
          },
        },
        lastApiUpdate: '2025-01-01T10:00:00Z',
        lastMqttUpdate: '2025-01-01T11:00:00Z',
      };
    });

    it('should_clearCache_when_called', async () => {
      // Act
      await stateManager.clearCache();

      // Assert
      expect(mockDevice.setStoreValue).toHaveBeenCalledWith(
        'deviceState',
        expect.objectContaining({
          vin: 'TEST_VIN_123', // Preserved
          driveTrain: DriveTrainType.ELECTRIC, // Preserved
          telematicCache: {}, // Cleared
          lastApiUpdate: null, // Cleared
          lastMqttUpdate: null, // Cleared
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Clearing device state cache');
    });

    it('should_returnVehicleStatus_when_cacheExists', () => {
      // Act
      const result = stateManager.getVehicleStatus();

      // Assert
      expect(result).toBeDefined();
      expect(result?.vin).toBe('TEST_VIN_123');
      expect(result?.driveTrain).toBe(DriveTrainType.ELECTRIC);
    });

    it('should_returnNull_when_noCacheExists', () => {
      // Arrange - Clear store
      mockStore = {};

      // Act
      const result = stateManager.getVehicleStatus();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should_handleMissingStore_gracefully', () => {
      // Arrange - No store data
      mockStore = {};

      // Act & Assert - Should not throw
      expect(() => stateManager.getUpdateMetadata()).not.toThrow();
      expect(() => stateManager.getTelematicCache()).not.toThrow();
      expect(() => stateManager.getVehicleStatus()).not.toThrow();
    });

    it('should_handleCorruptedStore_gracefully', () => {
      // Arrange - Corrupted store data
      mockStore.deviceState = null;

      // Act & Assert - Should not throw
      expect(() => stateManager.getUpdateMetadata()).not.toThrow();
      expect(() => stateManager.getTelematicCache()).not.toThrow();
      expect(() => stateManager.getVehicleStatus()).not.toThrow();
    });

    it('should_handleStoreReadError_gracefully', () => {
      // Arrange
      mockDevice.getStoreValue.mockImplementation(() => {
        throw new Error('Store read error');
      });

      // Act & Assert - Should not throw but log error
      expect(() => stateManager.getVehicleStatus()).not.toThrow();
    });
  });

  describe('Constructor Variations', () => {
    it('should_createWithoutLogger', () => {
      // Act
      const manager = new DeviceStateManager(mockDevice);

      // Assert
      expect(manager).toBeDefined();
    });

    it('should_createWithoutDelegate', () => {
      // Act
      const manager = new DeviceStateManager(mockDevice, mockLogger);

      // Assert
      expect(manager).toBeDefined();
    });

    it('should_createWithAllParameters', () => {
      // Act
      const manager = new DeviceStateManager(mockDevice, mockLogger, stateUpdateDelegate);

      // Assert
      expect(manager).toBeDefined();
    });
  });
});
