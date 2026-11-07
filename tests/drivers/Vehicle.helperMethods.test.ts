/**
 * Vehicle Helper Methods Tests
 *
 * Tests for Vehicle class helper methods including capability management,
 * unit conversion, and charging status conversion.
 */

// Mock geolocation-utils
jest.mock('geolocation-utils');

// Mock semver
jest.mock('semver');

import { Vehicle } from '../../drivers/Vehicle';
import { Capabilities } from '../../utils/Capabilities';
import { createMockedVehicle, updateMockDeviceData } from '../helpers/vehicleTestHelper';
import type { VehicleTestMocks } from '../helpers/vehicleTestHelper';

describe('Vehicle Helper Methods Tests', () => {
  let vehicle: Vehicle;
  let mocks: VehicleTestMocks;

  beforeEach(() => {
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mocks = result.mocks;
  });

  afterEach(() => {
    // Clean up any timers
    if (vehicle['_apiPollingTimer']) {
      clearTimeout(vehicle['_apiPollingTimer']);
      vehicle['_apiPollingTimer'] = undefined;
    }
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('addCapabilitySafe', () => {
    it('should_addCapability_when_capabilityDoesNotExist', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      await vehicle['addCapabilitySafe'](Capabilities.MEASURE_BATTERY);

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Adding capability')
      );
      expect(vehicle.addCapability).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
    });

    it('should_skipAddition_when_capabilityAlreadyExists', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(true);

      // Act
      await vehicle['addCapabilitySafe'](Capabilities.MEASURE_BATTERY);

      // Assert
      expect(mocks.mockLogger.info).not.toHaveBeenCalled();
      expect(vehicle.addCapability).not.toHaveBeenCalled();
    });
  });

  describe('removeCapabilitySafe', () => {
    it('should_removeCapability_when_capabilityExists', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(true);
      vehicle.getCapabilityValue = jest.fn().mockResolvedValue(75);

      // Act
      const result = await vehicle['removeCapabilitySafe'](Capabilities.MEASURE_BATTERY);

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Removing capability')
      );
      expect(vehicle.removeCapability).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(result).toBe(75);
    });

    it('should_returnUndefined_when_capabilityDoesNotExist', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      const result = await vehicle['removeCapabilitySafe'](Capabilities.MEASURE_BATTERY);

      // Assert
      expect(mocks.mockLogger.info).not.toHaveBeenCalled();
      expect(vehicle.removeCapability).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('setCapabilityValueSafe', () => {
    it('should_setCapabilityValue_when_valueProvided', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      const result = await vehicle['setCapabilityValueSafe'](Capabilities.MEASURE_BATTERY, 80);

      // Assert
      expect(vehicle.addCapability).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(vehicle.setCapabilityValue).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY, 80);
      expect(result).toBe(true);
    });

    it('should_setCapabilityValue_when_valueIsZero', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      const result = await vehicle['setCapabilityValueSafe'](Capabilities.MEASURE_BATTERY, 0);

      // Assert
      expect(vehicle.addCapability).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(vehicle.setCapabilityValue).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY, 0);
      expect(result).toBe(true);
    });

    it('should_setCapabilityValue_when_valueIsFalse', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      const result = await vehicle['setCapabilityValueSafe'](Capabilities.ALARM_GENERIC, false);

      // Assert
      expect(vehicle.addCapability).toHaveBeenCalledWith(Capabilities.ALARM_GENERIC);
      expect(vehicle.setCapabilityValue).toHaveBeenCalledWith(Capabilities.ALARM_GENERIC, false);
      expect(result).toBe(true);
    });

    it('should_returnFalse_when_valueIsNullish', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      const result = await vehicle['setCapabilityValueSafe'](Capabilities.MEASURE_BATTERY, null);

      // Assert
      expect(vehicle.addCapability).not.toHaveBeenCalled();
      expect(vehicle.setCapabilityValue).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('setDistanceUnits', () => {
    it('should_setKilometers_when_metricUnit', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(true);

      // Act
      await vehicle['setDistanceUnits']('metric');

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Setting distance unit to metric');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.MILEAGE, {
        units: 'km',
      });
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.RANGE, {
        units: 'km',
      });
    });

    it('should_setMiles_when_imperialUnit', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(true);

      // Act
      await vehicle['setDistanceUnits']('imperial');

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Setting distance unit to imperial');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.MILEAGE, {
        units: 'miles',
      });
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.RANGE, {
        units: 'miles',
      });
    });

    it('should_setRangeBatteryUnits_when_electricVehicle', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn((cap) => cap === Capabilities.RANGE_BATTERY);

      // Act
      await vehicle['setDistanceUnits']('metric');

      // Assert
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.RANGE_BATTERY, {
        units: 'km',
      });
    });
  });

  describe('setFuelUnits', () => {
    it('should_setLiters_when_literUnit', async () => {
      // Act
      await vehicle['setFuelUnits']('liter');

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Setting fuel unit to liter');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL, {
        units: 'l',
      });
    });

    it('should_setGallons_when_gallonUnit', async () => {
      // Act
      await vehicle['setFuelUnits']('gallon');

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Setting fuel unit to gallon');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL, {
        units: 'gal',
      });
    });
  });

  describe('convertChargingState', () => {
    type Cable = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
    type Status =
      | 'CHARGING'
      | 'PAUSED'
      | 'INITIALIZING'
      | 'COMPLETE'
      | 'NOT_CHARGING'
      | 'ERROR'
      | 'UNKNOWN';

    // Expected Homey state per charging status, for each cable state. `undefined` means the
    // capability is left as it is, because the plug state cannot be inferred.
    const TABLE: Record<Status, Record<Cable, string | undefined>> = {
      CHARGING: {
        DISCONNECTED: 'plugged_out',
        CONNECTED: 'plugged_in_charging',
        UNKNOWN: 'plugged_in_charging',
      },
      PAUSED: {
        DISCONNECTED: 'plugged_out',
        CONNECTED: 'plugged_in_paused',
        UNKNOWN: 'plugged_in_paused',
      },
      INITIALIZING: { DISCONNECTED: 'plugged_out', CONNECTED: 'plugged_in', UNKNOWN: undefined },
      COMPLETE: { DISCONNECTED: 'plugged_out', CONNECTED: 'plugged_in', UNKNOWN: undefined },
      NOT_CHARGING: { DISCONNECTED: 'plugged_out', CONNECTED: 'plugged_in', UNKNOWN: undefined },
      ERROR: { DISCONNECTED: 'plugged_out', CONNECTED: 'plugged_in', UNKNOWN: undefined },
      UNKNOWN: { DISCONNECTED: 'plugged_out', CONNECTED: 'plugged_in', UNKNOWN: undefined },
    };

    const rows = (Object.keys(TABLE) as Status[]).flatMap((status) =>
      (Object.keys(TABLE[status]) as Cable[]).map(
        (cable) => [cable, status, TABLE[status][cable]] as const
      )
    );

    it('should_coverEveryCableAndChargingStatusCombination', () => {
      expect(rows).toHaveLength(21);
    });

    it.each(rows)('should_map_cable_%s_and_status_%s_to_%s', (cable, status, expected) => {
      expect(vehicle['convertChargingState'](cable, status)).toBe(expected);
    });

    it('should_returnPluggedInNotPluggedOut_when_theCableIsConnectedAndTheCarIsWaitingForAScheduledStart', () => {
      // A car plugged in and waiting for a cheap-rate start reports NOCHARGING and a connected
      // cable. It used to show as plugged out.
      expect(vehicle['convertChargingState']('CONNECTED', 'NOT_CHARGING')).toBe('plugged_in');
    });

    it('should_returnPluggedOut_when_theCableIsDisconnectedEvenIfTheStatusSaysCharging', () => {
      expect(vehicle['convertChargingState']('DISCONNECTED', 'CHARGING')).toBe('plugged_out');
    });

    it('should_treatAnUnrecognisedCable_asUnknown', () => {
      // A status restored from data written by an older version of the app has no cable field
      expect(vehicle['convertChargingState'](undefined as any, 'CHARGING')).toBe(
        'plugged_in_charging'
      );
      expect(vehicle['convertChargingState'](undefined as any, 'NOT_CHARGING')).toBeUndefined();
    });

    it('should_onlyReturnValuesOfTheHomeyEvChargingStateCapability', () => {
      // plugged_in_discharging is the fifth value of the system capability; never used here
      const allowed = ['plugged_in_charging', 'plugged_in_paused', 'plugged_in', 'plugged_out'];

      for (const [cable, status] of rows) {
        const result = vehicle['convertChargingState'](cable, status);
        if (result !== undefined) {
          expect(allowed).toContain(result);
        }
      }
    });
  });

  describe('migrate_device_settings', () => {
    it('should_updateVersionToCurrentAppVersion_when_migrating', async () => {
      // Arrange - Update mock settings to return version 2.0.0
      mocks.mockSettings.currentVersion = '2.0.0';
      vehicle.homey.app.manifest = { version: '3.0.0' };

      // Act
      await vehicle['migrate_device_settings']();

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Settings version is 2.0.0.');
      expect(vehicle.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ currentVersion: '3.0.0' })
      );
    });

    it('should_setDefaultVersion_when_versionMissing', async () => {
      // Arrange
      vehicle.getSettings = jest.fn().mockReturnValue({});
      vehicle.setSettings = jest.fn().mockResolvedValue(undefined);
      vehicle.homey = {
        app: {
          manifest: { version: '3.0.0' },
        },
      } as any;

      // Act
      await vehicle['migrate_device_settings']();

      // Assert
      expect(vehicle.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          currentVersion: '3.0.0',
        })
      );
    });
  });

  describe('onRenamed', () => {
    it('should_logRename_when_deviceRenamed', () => {
      // Act
      vehicle.onRenamed('New Vehicle Name');

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Vehicle was renamed');
    });
  });

  describe('onDeleted', () => {
    it('should_disconnectMqttAndStopPolling_when_deviceDeleted', () => {
      // Arrange
      const mockMqttClient = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      };
      vehicle['_mqttClient'] = mockMqttClient as any;
      vehicle['_apiPollingTimer'] = setTimeout(() => {}, 10000);

      // Mock stopApiPolling
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});

      // Act
      vehicle.onDeleted();

      // Assert
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Vehicle has been deleted');
      expect(mockMqttClient.disconnect).toHaveBeenCalled();
      expect(vehicle['stopApiPolling']).toHaveBeenCalled();
    });

    it('should_handleGracefully_when_noMqttClient', () => {
      // Arrange
      vehicle['_mqttClient'] = undefined;

      // Act & Assert - Should not throw
      expect(() => vehicle.onDeleted()).not.toThrow();
      expect(mocks.mockLogger.info).toHaveBeenCalledWith('Vehicle has been deleted');
    });
  });

  describe('stopApiPolling', () => {
    it('should_clearTimer_when_pollingActive', () => {
      // Arrange
      const mockTimer = setTimeout(() => {}, 10000);
      vehicle['_apiPollingTimer'] = mockTimer;
      updateMockDeviceData(vehicle, { id: 'TEST123' });

      // Act
      vehicle['stopApiPolling']();

      // Assert
      expect(vehicle['_apiPollingTimer']).toBeUndefined();
      expect(mocks.mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Stopped API polling')
      );
    });

    it('should_doNothing_when_noActivePolling', () => {
      // Arrange
      vehicle['_apiPollingTimer'] = undefined;

      // Act
      vehicle['stopApiPolling']();

      // Assert
      expect(mocks.mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
