/**
 * Vehicle.updateCapabilitiesFromStatus Tests
 *
 * Tests for the capability update logic that handles VehicleStatus updates
 * and synchronizes them with Homey device capabilities.
 *
 * CRITICAL: These tests validate that undefined values in VehicleStatus
 * are handled gracefully without breaking capability updates.
 */

// Mock geolocation-utils
jest.mock('geolocation-utils', () => ({
  distanceTo: jest.fn().mockReturnValue(150), // Default: distance > threshold
}));

// Mock semver
jest.mock('semver');

import { Vehicle } from '../../drivers/Vehicle';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import { Capabilities } from '../../utils/Capabilities';
import { DriveTrainType } from '../../lib/types/DriveTrainType';

describe('Vehicle.updateCapabilitiesFromStatus', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockLogger: any;
  let setCapabilityValueSafeSpy: jest.SpyInstance;
  let onLocationChangedSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock app
    mockApp = {
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      currentLocation: undefined,
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Create vehicle instance using Object.create to bypass constructor
    vehicle = Object.create(Vehicle.prototype);
    vehicle.app = mockApp;
    vehicle.logger = mockLogger;
    vehicle.homey = { app: mockApp } as any;

    // Create mock state manager
    const mockStateManager = {
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getVehicleStatus: jest.fn().mockReturnValue({
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
      }),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      getDriveTrain: jest.fn().mockReturnValue(DriveTrainType.ELECTRIC),
    } as any;
    vehicle['stateManager'] = mockStateManager;

    // Mock setCapabilityValueSafe to track capability updates
    setCapabilityValueSafeSpy = jest
      .spyOn(vehicle as any, 'setCapabilityValueSafe')
      .mockResolvedValue(true);

    // Mock onLocationChanged
    onLocationChangedSpy = jest
      .spyOn(vehicle as any, 'onLocationChanged')
      .mockResolvedValue(undefined);

    // Mock convertChargingStatus
    jest.spyOn(vehicle as any, 'convertChargingStatus').mockReturnValue('charging');

    // Initialize settings with defaults
    vehicle.settings = {
      distanceUnit: 'metric',
      fuelUnit: 'metric',
      locationUpdateThreshold: 100,
    } as any;

    // Initialize current state as null (first update)
    vehicle.currentVehicleState = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('P0: Undefined Handling', () => {
    it('should_updateAllCapabilities_when_validStatusProvided', async () => {
      // Arrange
      const validStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-10-29T10:00:00Z'),
        currentMileage: 15000,
        range: 350,
        location: {
          coordinates: {
            latitude: 52.52,
            longitude: 13.405,
          },
          address: {
            formatted: 'Berlin, Germany',
          },
        },
        lockState: {
          combinedSecurityState: 'SECURED',
          isLocked: true,
        },
        electric: {
          chargeLevelPercent: 85,
          range: 350,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(validStatus);

      // Assert - Verify all capabilities were updated with correct values
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MILEAGE, 15000);
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.RANGE, 350);
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.ALARM_GENERIC, false); // !isLocked
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY, 85);
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        expect.any(String)
      );

      // Verify location was updated
      expect(onLocationChangedSpy).toHaveBeenCalledWith({
        label: '',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin, Germany',
      });

      // Verify current state was stored
      expect(vehicle.currentVehicleState).toEqual(validStatus);

      // Verify logger was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated capabilities from status')
      );
    });

    it('should_handleGracefully_when_undefinedValuesInStatus', async () => {
      // Arrange - Status with many undefined fields (sparse MQTT update)
      const sparseStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-10-29T10:00:00Z'),
        // currentMileage: undefined (missing)
        // range: undefined (missing)
        // location: undefined (missing)
        lockState: {
          combinedSecurityState: 'UNLOCKED',
          isLocked: false,
        },
        // electric: undefined (missing)
        // combustion: undefined (missing)
      };

      // Act - Should not throw errors
      await expect(
        (vehicle as any).updateCapabilitiesFromStatus(sparseStatus)
      ).resolves.not.toThrow();

      // Assert - Only defined capabilities were updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.ALARM_GENERIC, true); // !isLocked

      // Verify mileage/range/battery were NOT called (undefined in status)
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.MILEAGE,
        expect.anything()
      );
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.RANGE,
        expect.anything()
      );
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.MEASURE_BATTERY,
        expect.anything()
      );

      // Verify location was NOT updated (undefined in status)
      expect(onLocationChangedSpy).not.toHaveBeenCalled();

      // Verify current state was still stored
      expect(vehicle.currentVehicleState).toEqual(sparseStatus);

      // Verify logger was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated capabilities from status')
      );
    });
  });
});
