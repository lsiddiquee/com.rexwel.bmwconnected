/**
 * Unit Tests for DeviceStateManager - Cache Coherence
 *
 * Tests timestamp-based merging to prevent three-way partial data bug:
 * - Direction 1: API partial data doesn't reset capabilities
 * - Direction 2: MQTT-only device seeds cache from API
 * - Direction 3: Stale MQTT doesn't override fresh API (ROOT CAUSE)
 *
 * CRITICAL: These tests validate the fix for the documented bug where stale
 * MQTT cached data was overriding fresh API data during merge operations.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DeviceStateManager } from '../../utils/DeviceStateManager';
import type { TelematicDataPoint, VehicleStatus } from '../../lib/models';
import type { IVehicleClient } from '../../lib/client/IVehicleClient';
import type { ILogger } from '../../lib/types/ILogger';
import { LogLevel } from '../../lib/types/ILogger';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import type Homey from 'homey';

describe('DeviceStateManager - Cache Coherence', () => {
  let mockDevice: jest.Mocked<Homey.Device>;
  let mockLogger: jest.Mocked<ILogger>;
  let stateManager: DeviceStateManager;
  let mockStore: Record<string, unknown>;

  beforeEach(() => {
    // CRITICAL: Create fresh mock store and ensure complete isolation
    // Each test must start with completely empty state
    mockStore = {};

    // Create mock device with functions that dynamically reference mockStore
    // Using mockImplementation ensures the closure captures the CURRENT mockStore variable
    mockDevice = {
      getStoreValue: jest
        .fn<(key: string) => unknown>()
        .mockImplementation((key: string) => mockStore[key]),
      setStoreValue: jest
        .fn<(key: string, value: unknown) => Promise<void>>()
        .mockImplementation((key: string, value: unknown) => {
          // CRITICAL: Deep clone to prevent object mutation within test
          // DeviceStateManager's loadStoreData() returns the object from mockStore directly.
          // When DeviceStateManager mutates that object and saves it back,
          // without cloning, mockStore contains a reference to the SAME mutated object.
          // This simulates Homey's actual behavior where setStoreValue serializes
          // (creating an immutable snapshot) and getStoreValue deserializes (creating new object).
          mockStore[key] = JSON.parse(JSON.stringify(value));
          return Promise.resolve();
        }),
      getSettings: jest
        .fn<() => Record<string, unknown>>()
        .mockReturnValue({ streamingEnabled: true }),
    } as unknown as jest.Mocked<Homey.Device>;

    // Create mock logger
    mockLogger = {
      log: jest.fn(),
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(() => LogLevel.INFO),
    } as jest.Mocked<ILogger>;

    // Create NEW state manager instance for each test
    // This ensures no internal state carries over between tests
    stateManager = new DeviceStateManager(mockDevice, mockLogger);
  });

  describe("Direction 3: Stale MQTT doesn't override fresh API (ROOT CAUSE)", () => {
    it('should_preserveApiValue_when_staleMqttInCache', async () => {
      // Arrange - T1: MQTT arrives with battery 95% at 10:00:00
      const mqttData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 95,
          unit: 'PERCENT',
          source: 'mqtt',
        },
      };
      await stateManager.updateFromApi(mqttData); // Simulate MQTT update via API path

      // T2: API updates with battery 87% at 10:05:00 (newer)
      const apiData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:05:00.000Z',
          value: 87,
          unit: 'PERCENT',
          source: 'api',
        },
      };
      await stateManager.updateFromApi(apiData);

      // T3: New MQTT arrives with location update (different key) - simulates cache merge
      const newMqttData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.location.coordinates.latitude': {
          timestamp: '2025-10-29T10:06:00.000Z',
          value: 52.1234,
          source: 'mqtt',
        },
      };
      await stateManager.updateFromApi(newMqttData);

      // Act - Get final cache state
      const battery = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargeLevelPercent'
      );

      // Assert - Battery should still be 87% (from API T2), NOT reverted to stale MQTT 95%
      expect(battery).toBeDefined();
      expect(battery?.value).toBe(87);
      expect(battery?.timestamp).toBe('2025-10-29T10:05:00.000Z');
    });

    it('should_updateOnlyChangedFields_when_apiReturnsPartialElectric', async () => {
      // Arrange - Initial cache with complete electric data
      const initialCache: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 80,
          unit: 'PERCENT',
          source: 'api',
        },
        'vehicleStatus.electricChargingState.range': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 200,
          unit: 'KILOMETERS',
          source: 'api',
        },
        'vehicleStatus.electricChargingState.chargingStatus': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 'CHARGING',
          source: 'api',
        },
      };
      await stateManager.updateFromApi(initialCache);

      // API returns only battery update (no range/status)
      const partialApiData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:05:00.000Z',
          value: 75,
          unit: 'PERCENT',
          source: 'api',
        },
      };

      // Act
      await stateManager.updateFromApi(partialApiData);

      // Assert - Battery updated, range/status preserved
      const battery = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargeLevelPercent'
      );
      const range = stateManager.getTelematicValue('vehicleStatus.electricChargingState.range');
      const chargingStatus = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargingStatus'
      );

      expect(battery?.value).toBe(75); // Updated
      expect(range?.value).toBe(200); // Preserved
      expect(chargingStatus?.value).toBe('CHARGING'); // Preserved
    });

    it('should_updateOnlyChangedFields_when_apiReturnsPartialCombustion', async () => {
      // Arrange - Initial cache with complete combustion data
      const initialCache: Record<string, TelematicDataPoint> = {
        'vehicleStatus.combustionFuelLevel.remainingFuelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 60,
          unit: 'PERCENT',
          source: 'api',
        },
        'vehicleStatus.combustionFuelLevel.remainingFuelLiters': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 35,
          unit: 'LITERS',
          source: 'api',
        },
        'vehicleStatus.combustionFuelLevel.range': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 450,
          unit: 'KILOMETERS',
          source: 'api',
        },
      };
      await stateManager.updateFromApi(initialCache);

      // API returns only fuel percent update (no liters/range)
      const partialApiData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.combustionFuelLevel.remainingFuelPercent': {
          timestamp: '2025-10-29T10:05:00.000Z',
          value: 55,
          unit: 'PERCENT',
          source: 'api',
        },
      };

      // Act
      await stateManager.updateFromApi(partialApiData);

      // Assert - Fuel percent updated, liters/range preserved
      const fuelPercent = stateManager.getTelematicValue(
        'vehicleStatus.combustionFuelLevel.remainingFuelPercent'
      );
      const fuelLiters = stateManager.getTelematicValue(
        'vehicleStatus.combustionFuelLevel.remainingFuelLiters'
      );
      const range = stateManager.getTelematicValue('vehicleStatus.combustionFuelLevel.range');

      expect(fuelPercent?.value).toBe(55); // Updated
      expect(fuelLiters?.value).toBe(35); // Preserved
      expect(range?.value).toBe(450); // Preserved
    });

    it('should_mergeBothUpdates_when_apiAndMqttUpdateDifferentFields', async () => {
      // Arrange - API updates battery
      const apiData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 75,
          unit: 'PERCENT',
          source: 'api',
        },
      };
      await stateManager.updateFromApi(apiData);

      // MQTT updates location (different field)
      const mqttData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.location.coordinates.latitude': {
          timestamp: '2025-10-29T10:01:00.000Z',
          value: 52.1234,
          source: 'mqtt',
        },
        'vehicleStatus.location.coordinates.longitude': {
          timestamp: '2025-10-29T10:01:00.000Z',
          value: 4.5678,
          source: 'mqtt',
        },
      };
      await stateManager.updateFromApi(mqttData);

      // Act - Get both values
      const battery = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargeLevelPercent'
      );
      const latitude = stateManager.getTelematicValue(
        'vehicleStatus.location.coordinates.latitude'
      );
      const longitude = stateManager.getTelematicValue(
        'vehicleStatus.location.coordinates.longitude'
      );

      // Assert - Both present in final cache
      expect(battery?.value).toBe(75);
      expect(latitude?.value).toBe(52.1234);
      expect(longitude?.value).toBe(4.5678);
    });
  });

  describe('Direction 2: MQTT-only device seeds cache from API', () => {
    it('should_seedCacheFromApi_when_freshDeviceColdStart', async () => {
      // Arrange - Create mock API client with complete vehicle data
      const mockVehicleStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.PLUGIN_HYBRID,
        lastUpdatedAt: new Date('2025-10-29T10:00:00.000Z'),
      } as VehicleStatus;

      const mockRawData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 80,
          unit: 'PERCENT',
          source: 'api',
        },
        'vehicleStatus.location.coordinates.latitude': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 52.3676,
          source: 'api',
        },
        'vehicleStatus.location.coordinates.longitude': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 4.9041,
          source: 'api',
        },
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 45000,
          unit: 'KILOMETERS',
          source: 'api',
        },
      };

      const mockApiClient = {
        authenticate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        isAuthenticated: jest.fn<() => boolean>().mockReturnValue(true),
        getVehicles: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
        getVehicleStatus: jest
          .fn<(vin: string, containerId?: string) => Promise<VehicleStatus>>()
          .mockResolvedValue(mockVehicleStatus),
        getRawTelematicData: jest
          .fn<(vin: string, containerId: string) => Promise<Record<string, TelematicDataPoint>>>()
          .mockResolvedValue(mockRawData),
        refreshAuthentication: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<IVehicleClient>;

      // Act - Initialize with container ID (triggers cache seeding)
      const status = await stateManager.initialize(
        mockApiClient,
        'WBA12345678901234',
        'test-container-id'
      );

      // Assert - Cache seeded with complete vehicle data BEFORE MQTT starts
      expect(mockApiClient.getVehicleStatus).toHaveBeenCalledWith('WBA12345678901234');
      expect(mockApiClient.getRawTelematicData).toHaveBeenCalledWith(
        'WBA12345678901234',
        'test-container-id'
      );

      const battery = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargeLevelPercent'
      );
      const mileage = stateManager.getTelematicValue('vehicleStatus.mileage');

      expect(battery?.value).toBe(80);
      expect(mileage?.value).toBe(45000);
      expect(status).not.toBeNull();
    });
  });

  describe('Timestamp Merging Edge Cases', () => {
    it('should_preferNewest_when_timestampsIdentical', async () => {
      // Arrange - Same timestamp, different values
      const firstUpdate: Record<string, TelematicDataPoint> = {
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 45000,
          unit: 'KILOMETERS',
          source: 'mqtt',
        },
      };
      await stateManager.updateFromApi(firstUpdate);

      const secondUpdate: Record<string, TelematicDataPoint> = {
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:00:00.000Z', // Same timestamp
          value: 45001,
          unit: 'KILOMETERS',
          source: 'api',
        },
      };

      // Act
      await stateManager.updateFromApi(secondUpdate);

      // Assert - Second update wins (>= condition)
      const mileage = stateManager.getTelematicValue('vehicleStatus.mileage');
      expect(mileage?.value).toBe(45001);
    });

    it('should_preferRecent_when_veryOldMqttVsRecentApi', async () => {
      // Arrange - Very old MQTT data (1 day ago)
      const oldMqttData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-28T10:00:00.000Z',
          value: 90,
          unit: 'PERCENT',
          source: 'mqtt',
        },
      };
      await stateManager.updateFromApi(oldMqttData);

      // Recent API data (now)
      const recentApiData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 85,
          unit: 'PERCENT',
          source: 'api',
        },
      };

      // Act
      await stateManager.updateFromApi(recentApiData);

      // Assert - Recent API wins
      const battery = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargeLevelPercent'
      );
      expect(battery?.value).toBe(85);
      expect(battery?.timestamp).toBe('2025-10-29T10:00:00.000Z');
    });

    it('should_preferRecent_when_recentMqttVsVeryOldApi', async () => {
      // Arrange - Very old API data (1 day ago)
      const oldApiData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.location.coordinates.latitude': {
          timestamp: '2025-10-28T10:00:00.000Z',
          value: 50.0,
          source: 'api',
        },
      };
      await stateManager.updateFromApi(oldApiData);

      // Recent MQTT data (now)
      const recentMqttData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.location.coordinates.latitude': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 52.3676,
          source: 'mqtt',
        },
      };

      // Act
      await stateManager.updateFromApi(recentMqttData);

      // Assert - Recent MQTT wins
      const latitude = stateManager.getTelematicValue(
        'vehicleStatus.location.coordinates.latitude'
      );
      expect(latitude?.value).toBe(52.3676);
      expect(latitude?.timestamp).toBe('2025-10-29T10:00:00.000Z');
    });

    it('should_handleFutureTimestamps_when_clockSkew', async () => {
      // Arrange - Current data
      const currentData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 45000,
          unit: 'KILOMETERS',
          source: 'api',
        },
      };
      await stateManager.updateFromApi(currentData);

      // Future timestamp (clock skew - 5 minutes ahead)
      const futureData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:05:00.000Z',
          value: 45001,
          unit: 'KILOMETERS',
          source: 'mqtt',
        },
      };

      // Act
      await stateManager.updateFromApi(futureData);

      // Assert - Future timestamp accepted (>= condition allows it)
      const mileage = stateManager.getTelematicValue('vehicleStatus.mileage');
      expect(mileage?.value).toBe(45001);
      expect(mileage?.timestamp).toBe('2025-10-29T10:05:00.000Z');
    });

    it('should_notOverwriteCache_when_apiReturnsEmpty', async () => {
      // Arrange - Initial cache with data
      const initialData: Record<string, TelematicDataPoint> = {
        'vehicleStatus.electricChargingState.chargeLevelPercent': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 80,
          unit: 'PERCENT',
          source: 'api',
        },
      };
      await stateManager.updateFromApi(initialData);

      // API returns empty object
      const emptyApiData: Record<string, TelematicDataPoint> = {};

      // Act
      await stateManager.updateFromApi(emptyApiData);

      // Assert - Cache unchanged
      const battery = stateManager.getTelematicValue(
        'vehicleStatus.electricChargingState.chargeLevelPercent'
      );
      expect(battery?.value).toBe(80);
    });
  });
});
