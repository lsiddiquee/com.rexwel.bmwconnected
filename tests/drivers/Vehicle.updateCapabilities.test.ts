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
import { createMockedVehicle } from '../helpers/vehicleTestHelper';
import { UNKNOWN_FLOW_STATES } from '../../utils/FlowStates';

describe('Vehicle.updateCapabilitiesFromStatus', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockLogger: any;
  let setCapabilityValueSafeSpy: jest.SpyInstance;
  let checkGeofenceSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create vehicle instance using helper
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;
    mockLogger = result.mocks.mockLogger;

    mockApp.currentLocation = undefined;

    // Create mock flow cards
    const mockFlowCard = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };
    const mockFlow = {
      getDeviceTriggerCard: jest.fn().mockReturnValue(mockFlowCard),
    };
    const mockSettings = {
      get: jest.fn().mockReturnValue(null), // No geofences
    };

    vehicle.homey = {
      app: mockApp,
      flow: mockFlow,
      settings: mockSettings,
    } as any;

    // Create mock state manager
    const mockStateManager = {
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getLastFlowTriggeredLocation: jest.fn().mockReturnValue(null),
      setLastFlowTriggeredLocation: jest.fn().mockResolvedValue(undefined),
      getIsDriving: jest.fn().mockReturnValue(false),
      setIsDriving: jest.fn().mockResolvedValue(undefined),
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

    // Mock location handling methods (now inline in updateCapabilitiesFromStatus)
    checkGeofenceSpy = jest.spyOn(vehicle as any, 'checkGeofence').mockResolvedValue(undefined);

    // Initialize current state as null (first update)
    vehicle.currentVehicleState = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Door and Window State', () => {
    it('should_updateDoorState_when_doorsPresent', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
        doors: {
          combinedState: 'OPEN',
          leftFront: 'OPEN',
          rightFront: 'CLOSED',
          leftRear: 'CLOSED',
          rightRear: 'CLOSED',
          hood: 'CLOSED',
          trunk: 'CLOSED',
        },
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.DOOR_STATE, 'OPEN');
    });

    it('should_updateWindowState_when_windowsPresent', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
        windows: {
          combinedState: 'INTERMEDIATE',
          leftFront: 'INTERMEDIATE',
          rightFront: 'CLOSED',
          leftRear: 'CLOSED',
          rightRear: 'CLOSED',
        },
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.WINDOW_STATE,
        'INTERMEDIATE'
      );
    });

    it('should_notUpdateDoorOrWindowState_when_bothAbsent', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.DOOR_STATE,
        expect.anything()
      );
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.WINDOW_STATE,
        expect.anything()
      );
    });
  });

  describe('Fuel Level Percent', () => {
    it('should_updateFuelLevelPercent_when_fuelLevelPercentPresent', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
        combustion: {
          fuelLevelPercent: 72,
          fuelLevelLiters: 36,
        },
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.FUEL_LEVEL_PERCENT, 72);
    });

    it('should_notUpdateFuelLevelPercent_when_fuelLevelPercentUndefined', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
        combustion: {
          fuelLevelLiters: 36,
        },
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.FUEL_LEVEL_PERCENT,
        expect.anything()
      );
    });
  });

  describe('Climate Status', () => {
    it('should_updateClimateStatus_when_climatePresent', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
        climate: { activity: 'HEATING' },
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.CLIMATE_STATUS,
        'HEATING'
      );
    });

    it('should_notUpdateClimateStatus_when_climateAbsent', async () => {
      const status: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        ...UNKNOWN_FLOW_STATES,
      };

      await (vehicle as any).updateCapabilitiesFromStatus(status);

      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.CLIMATE_STATUS,
        expect.anything()
      );
    });
  });

  describe('P0: Undefined Handling', () => {
    it('should_updateAllCapabilities_when_validStatusProvided', async () => {
      // Arrange
      const validStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-10-29T10:00:00Z'),
        ...UNKNOWN_FLOW_STATES,
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
        'plugged_in_charging'
      );

      // Verify location was updated (checkGeofence called with new location)
      expect(checkGeofenceSpy).toHaveBeenCalledWith({
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
        ...UNKNOWN_FLOW_STATES,
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
      expect(checkGeofenceSpy).not.toHaveBeenCalled();

      // Verify current state was still stored
      expect(vehicle.currentVehicleState).toEqual(sparseStatus);

      // Verify logger was called
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated capabilities from status')
      );
    });
  });

  describe('Battery level', () => {
    const electricStatus = (
      electric: Partial<NonNullable<VehicleStatus['electric']>>
    ): VehicleStatus => ({
      vin: 'WBA12345678901234',
      driveTrain: DriveTrainType.ELECTRIC,
      lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
      ...UNKNOWN_FLOW_STATES,
      electric: {
        range: 300,
        isChargerConnected: false,
        chargingStatus: 'NOT_CHARGING',
        ...electric,
      },
    });

    it('should_notUpdateMeasureBattery_when_theBatteryLevelIsMissing', async () => {
      // The battery management header was not in the data: there is no reading, not a 0% one
      await (vehicle as any).updateCapabilitiesFromStatus(
        electricStatus({ chargeLevelPercent: undefined })
      );

      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.MEASURE_BATTERY,
        expect.anything()
      );
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.MEASURE_BATTERY,
        undefined
      );
    });

    it('should_keepWritingTheOtherCapabilities_when_theBatteryLevelIsMissing', async () => {
      await (vehicle as any).updateCapabilitiesFromStatus({
        ...electricStatus({ chargeLevelPercent: undefined, chargingStatus: 'CHARGING' }),
        chargingCable: 'CONNECTED',
        currentMileage: 4321,
      });

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MILEAGE, 4321);
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in_charging'
      );
    });

    it('should_updateMeasureBatteryToZero_when_theBatteryIsReallyEmpty', async () => {
      await (vehicle as any).updateCapabilitiesFromStatus(
        electricStatus({ chargeLevelPercent: 0 })
      );

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY, 0);
    });

    it('should_updateMeasureBattery_when_theBatteryLevelIsKnown', async () => {
      await (vehicle as any).updateCapabilitiesFromStatus(
        electricStatus({ chargeLevelPercent: 64 })
      );

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY, 64);
    });
  });

  describe('EV charging state', () => {
    const status = (
      chargingCable: VehicleStatus['chargingCable'],
      chargingStatus: NonNullable<VehicleStatus['electric']>['chargingStatus']
    ): VehicleStatus => ({
      vin: 'WBA12345678901234',
      driveTrain: DriveTrainType.ELECTRIC,
      lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
      ...UNKNOWN_FLOW_STATES,
      chargingCable,
      electric: { chargeLevelPercent: 50, range: 200, isChargerConnected: false, chargingStatus },
    });

    it.each([
      ['CONNECTED', 'NOT_CHARGING', 'plugged_in'],
      ['CONNECTED', 'CHARGING', 'plugged_in_charging'],
      ['CONNECTED', 'PAUSED', 'plugged_in_paused'],
      ['DISCONNECTED', 'NOT_CHARGING', 'plugged_out'],
      ['UNKNOWN', 'CHARGING', 'plugged_in_charging'],
      ['UNKNOWN', 'PAUSED', 'plugged_in_paused'],
    ] as const)(
      'should_setEvChargingState_when_cable_%s_and_status_%s_gives_%s',
      async (cable, chargingStatus, expected) => {
        await (vehicle as any).updateCapabilitiesFromStatus(status(cable, chargingStatus));

        expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
          Capabilities.EV_CHARGING_STATE,
          expected
        );
      }
    );

    it.each(['NOT_CHARGING', 'COMPLETE', 'INITIALIZING', 'ERROR', 'UNKNOWN'] as const)(
      'should_leaveEvChargingStateAsItIs_when_theCableIsUnknownAndTheStatusIs_%s',
      async (chargingStatus) => {
        await (vehicle as any).updateCapabilitiesFromStatus(status('UNKNOWN', chargingStatus));

        expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
          Capabilities.EV_CHARGING_STATE,
          expect.anything()
        );
      }
    );
  });
});
