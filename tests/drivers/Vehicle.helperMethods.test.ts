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

describe('Vehicle Helper Methods Tests', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockLogger: any;

  beforeEach(() => {
    // Create mock app and logger
    mockApp = {
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
    };

    mockLogger = mockApp.logger;

    // Create vehicle instance using Object.create to bypass constructor
    vehicle = Object.create(Vehicle.prototype);
    vehicle.app = mockApp;
    vehicle.logger = mockLogger;

    // Mock homey object
    vehicle.homey = {
      app: mockApp,
      version: '12.5.0',
    } as any;

    // Mock Device methods
    vehicle.getName = jest.fn().mockReturnValue('Test BMW i4');
    vehicle.hasCapability = jest.fn().mockReturnValue(false);
    vehicle.addCapability = jest.fn().mockResolvedValue(undefined);
    vehicle.removeCapability = jest.fn().mockResolvedValue(undefined);
    vehicle.getCapabilityValue = jest.fn().mockResolvedValue(100);
    vehicle.setCapabilityValue = jest.fn().mockResolvedValue(undefined);
    vehicle.setCapabilityOptions = jest.fn().mockResolvedValue(undefined);

    // Initialize settings
    vehicle.settings = {
      distanceUnit: 'metric',
      fuelUnit: 'liter',
    } as any;
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
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Adding capability'));
      expect(vehicle.addCapability).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
    });

    it('should_skipAddition_when_capabilityAlreadyExists', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(true);

      // Act
      await vehicle['addCapabilitySafe'](Capabilities.MEASURE_BATTERY);

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
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
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Removing capability'));
      expect(vehicle.removeCapability).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(result).toBe(75);
    });

    it('should_returnUndefined_when_capabilityDoesNotExist', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn().mockReturnValue(false);

      // Act
      const result = await vehicle['removeCapabilitySafe'](Capabilities.MEASURE_BATTERY);

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
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
      expect(mockLogger.info).toHaveBeenCalledWith('Setting distance unit to metric');
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
      expect(mockLogger.info).toHaveBeenCalledWith('Setting distance unit to imperial');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.MILEAGE, {
        units: 'miles',
      });
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.RANGE, {
        units: 'miles',
      });
    });

    it('should_setRangeBatteryUnits_when_electricVehicle', async () => {
      // Arrange
      vehicle.hasCapability = jest.fn((cap) => cap === Capabilities.MEASURE_BATTERY);

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
      expect(mockLogger.info).toHaveBeenCalledWith('Setting fuel unit to liter');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL, {
        units: 'l',
      });
    });

    it('should_setGallons_when_gallonUnit', async () => {
      // Act
      await vehicle['setFuelUnits']('gallon');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Setting fuel unit to gallon');
      expect(vehicle.setCapabilityOptions).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL, {
        units: 'gal',
      });
    });
  });

  describe('convertChargingStatus', () => {
    it('should_returnPluggedInCharging_when_statusIsCharging', () => {
      // Act
      const result = vehicle['convertChargingStatus']('CHARGING');

      // Assert
      expect(result).toBe('plugged_in_charging');
    });

    it('should_returnPluggedIn_when_statusIsPluggedIn', () => {
      // Act
      const result = vehicle['convertChargingStatus']('PLUGGED_IN');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedIn_when_statusIsWaitingForCharging', () => {
      // Act
      const result = vehicle['convertChargingStatus']('WAITING_FOR_CHARGING');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedIn_when_statusIsComplete', () => {
      // Act
      const result = vehicle['convertChargingStatus']('COMPLETE');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedIn_when_statusIsFullyCharged', () => {
      // Act
      const result = vehicle['convertChargingStatus']('FULLY_CHARGED');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedIn_when_statusIsFinishedFullyCharged', () => {
      // Act
      const result = vehicle['convertChargingStatus']('FINISHED_FULLY_CHARGED');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedIn_when_statusIsFinishedNotFull', () => {
      // Act
      const result = vehicle['convertChargingStatus']('FINISHED_NOT_FULL');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedIn_when_statusIsTargetReached', () => {
      // Act
      const result = vehicle['convertChargingStatus']('TARGET_REACHED');

      // Assert
      expect(result).toBe('plugged_in');
    });

    it('should_returnPluggedOut_when_statusIsNotCharging', () => {
      // Act
      const result = vehicle['convertChargingStatus']('NOT_CHARGING');

      // Assert
      expect(result).toBe('plugged_out');
    });

    it('should_returnPluggedOut_when_statusIsInvalid', () => {
      // Act
      const result = vehicle['convertChargingStatus']('INVALID');

      // Assert
      expect(result).toBe('plugged_out');
    });

    it('should_returnPluggedOut_when_statusIsUnknown', () => {
      // Act
      const result = vehicle['convertChargingStatus']('UNKNOWN');

      // Assert
      expect(result).toBe('plugged_out');
    });

    it('should_returnPluggedOut_when_statusIsUnrecognized', () => {
      // Act
      const result = vehicle['convertChargingStatus']('SOME_NEW_STATUS');

      // Assert
      expect(result).toBe('plugged_out');
    });
  });

  describe('migrate_device_settings', () => {
    it('should_updateVersionToCurrentAppVersion_when_migrating', async () => {
      // Arrange
      vehicle.getSettings = jest.fn().mockReturnValue({
        currentVersion: '2.0.0',
      });
      vehicle.setSettings = jest.fn().mockResolvedValue(undefined);
      vehicle.homey = {
        app: {
          manifest: { version: '3.0.0' },
        },
      } as any;

      // Act
      await vehicle['migrate_device_settings']();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Settings version is 2.0.0.');
      expect(vehicle.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          currentVersion: '3.0.0',
        })
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
      expect(mockLogger.info).toHaveBeenCalledWith('Vehicle was renamed');
    });
  });

  describe('onDeleted', () => {
    it('should_disconnectMqttAndStopPolling_when_deviceDeleted', () => {
      // Arrange
      const mockMqttClient = {
        disconnect: jest.fn().mockResolvedValue(undefined),
      };
      vehicle['_mqttClient'] = mockMqttClient as any;
      vehicle['_apiPollingTimer'] = setTimeout(() => {}, 10000) as NodeJS.Timeout;

      // Mock stopApiPolling
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});

      // Act
      vehicle.onDeleted();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Vehicle has been deleted');
      expect(mockMqttClient.disconnect).toHaveBeenCalled();
      expect(vehicle['stopApiPolling']).toHaveBeenCalled();
    });

    it('should_handleGracefully_when_noMqttClient', () => {
      // Arrange
      vehicle['_mqttClient'] = undefined;

      // Act & Assert - Should not throw
      expect(() => vehicle.onDeleted()).not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Vehicle has been deleted');
    });
  });

  describe('stopApiPolling', () => {
    it('should_clearTimer_when_pollingActive', () => {
      // Arrange
      const mockTimer = setTimeout(() => {}, 10000);
      vehicle['_apiPollingTimer'] = mockTimer;
      vehicle.deviceData = { id: 'TEST123' } as any;

      // Act
      vehicle['stopApiPolling']();

      // Assert
      expect(vehicle['_apiPollingTimer']).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped API polling'));
    });

    it('should_doNothing_when_noActivePolling', () => {
      // Arrange
      vehicle['_apiPollingTimer'] = undefined;

      // Act
      vehicle['stopApiPolling']();

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
