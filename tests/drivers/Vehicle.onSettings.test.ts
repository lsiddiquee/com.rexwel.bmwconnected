/**
 * Tests for Vehicle.onSettings
 *
 * Validates settings change handling for API polling, MQTT streaming, and unit preferences.
 */

import { Vehicle } from '../../drivers/Vehicle';
import { DeviceSettings } from '../../utils/DeviceSettings';
import { VehicleStatus } from '../../lib/models/VehicleStatus';

describe('Vehicle.onSettings', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockLogger: any;
  let mockStateManager: any;
  let mockMqttClient: any;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Create mock app
    mockApp = {
      logger: mockLogger,
    };

    // Create mock MQTT client
    mockMqttClient = {
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock state manager
    mockStateManager = {
      getVehicleStatus: jest.fn(),
      updateFromApi: jest.fn().mockResolvedValue(undefined),
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      getDriveTrain: jest.fn().mockReturnValue('PLUGIN_HYBRID'),
      setDriveTrain: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteLocation: jest.fn().mockReturnValue(null),
      setLastTripCompleteLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteMileage: jest.fn().mockReturnValue(null),
      setLastTripCompleteMileage: jest.fn().mockResolvedValue(undefined),
      updateFromMqttMessage: jest.fn().mockResolvedValue(undefined),
      clearCache: jest.fn(),
    };

    // Create Vehicle instance bypassing constructor
    vehicle = Object.create(Vehicle.prototype);
    vehicle.app = mockApp;
    vehicle.logger = mockLogger;
    vehicle.homey = { app: mockApp } as any;
    vehicle.settings = new DeviceSettings();
    vehicle['stateManager'] = mockStateManager;

    // Mock private methods
    vehicle['startApiPolling'] = jest.fn();
    vehicle['stopApiPolling'] = jest.fn();
    vehicle['initializeMqttStreaming'] = jest.fn().mockResolvedValue(undefined);
    vehicle['setDistanceUnits'] = jest.fn().mockResolvedValue(undefined);
    vehicle['setFuelUnits'] = jest.fn().mockResolvedValue(undefined);
    vehicle['updateCapabilitiesFromStatus'] = jest.fn().mockResolvedValue(undefined);
  });

  describe('API Polling Settings', () => {
    it('should_startApiPolling_when_apiPollingEnabledChangedToTrue', async () => {
      // Arrange
      vehicle.settings.apiPollingEnabled = true;
      const newSettings = { apiPollingEnabled: true };
      const changedKeys = ['apiPollingEnabled'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['startApiPolling']).toHaveBeenCalledTimes(1);
      expect(vehicle['stopApiPolling']).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('API polling enabled');
    });

    it('should_stopApiPolling_when_apiPollingEnabledChangedToFalse', async () => {
      // Arrange
      vehicle.settings.apiPollingEnabled = false;
      const newSettings = { apiPollingEnabled: false };
      const changedKeys = ['apiPollingEnabled'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['stopApiPolling']).toHaveBeenCalledTimes(1);
      expect(vehicle['startApiPolling']).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('API polling disabled');
    });

    it('should_restartApiPolling_when_apiPollingIntervalChanged', async () => {
      // Arrange
      vehicle.settings.apiPollingEnabled = true;
      vehicle.settings.apiPollingInterval = 60;
      const newSettings = { apiPollingInterval: 60 };
      const changedKeys = ['apiPollingInterval'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['startApiPolling']).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('API polling interval changed to 60 minutes');
    });

    it('should_handleBothIntervalAndEnabledChange_when_bothChanged', async () => {
      // Arrange
      vehicle.settings.apiPollingEnabled = true;
      vehicle.settings.apiPollingInterval = 45;
      const newSettings = { apiPollingEnabled: true, apiPollingInterval: 45 };
      const changedKeys = ['apiPollingEnabled', 'apiPollingInterval'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['startApiPolling']).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('API polling interval changed to 45 minutes');
      expect(mockLogger.info).toHaveBeenCalledWith('API polling enabled');
    });
  });

  describe('MQTT Streaming Settings', () => {
    it('should_initializeMqttStreaming_when_streamingEnabledChangedToTrue', async () => {
      // Arrange
      vehicle.settings.streamingEnabled = true;
      const newSettings = { streamingEnabled: true };
      const changedKeys = ['streamingEnabled'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['initializeMqttStreaming']).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT streaming enabled');
    });

    it('should_disconnectMqttClient_when_streamingEnabledChangedToFalse', async () => {
      // Arrange
      vehicle.settings.streamingEnabled = false;
      vehicle['_mqttClient'] = mockMqttClient;
      const newSettings = { streamingEnabled: false };
      const changedKeys = ['streamingEnabled'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(mockMqttClient.disconnect).toHaveBeenCalledTimes(1);
      expect(vehicle['_mqttClient']).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT streaming disabled');
    });

    it('should_notDisconnectMqttClient_when_noMqttClientExists', async () => {
      // Arrange
      vehicle.settings.streamingEnabled = false;
      vehicle['_mqttClient'] = undefined;
      const newSettings = { streamingEnabled: false };
      const changedKeys = ['streamingEnabled'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(mockMqttClient.disconnect).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('MQTT streaming disabled');
    });
  });

  describe('Distance Unit Settings', () => {
    it('should_updateDistanceUnits_when_distanceUnitChanged', async () => {
      // Arrange
      vehicle.settings.distanceUnit = 'imperial';
      const mockStatus: VehicleStatus = {
        vin: 'TEST123',
        driveTrain: 'ELECTRIC',
        currentMileage: 10000,
      } as VehicleStatus;
      mockStateManager.getVehicleStatus.mockReturnValue(mockStatus);

      const newSettings = { distanceUnit: 'imperial' };
      const changedKeys = ['distanceUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setDistanceUnits']).toHaveBeenCalledWith('imperial');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(mockStatus);
      expect(mockApp.logger.info).toHaveBeenCalledWith('Distance unit changed.');
    });

    it('should_updateDistanceUnitsToMetric_when_distanceUnitChangedToMetric', async () => {
      // Arrange
      vehicle.settings.distanceUnit = 'metric';
      const mockStatus: VehicleStatus = {
        vin: 'TEST123',
        driveTrain: 'ELECTRIC',
        currentMileage: 5000,
      } as VehicleStatus;
      mockStateManager.getVehicleStatus.mockReturnValue(mockStatus);

      const newSettings = { distanceUnit: 'metric' };
      const changedKeys = ['distanceUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setDistanceUnits']).toHaveBeenCalledWith('metric');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(mockStatus);
    });

    it('should_notUpdateCapabilities_when_distanceUnitChangedButNoStatus', async () => {
      // Arrange
      vehicle.settings.distanceUnit = 'imperial';
      mockStateManager.getVehicleStatus.mockReturnValue(null);

      const newSettings = { distanceUnit: 'imperial' };
      const changedKeys = ['distanceUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setDistanceUnits']).toHaveBeenCalledWith('imperial');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(null);
    });
  });

  describe('Fuel Unit Settings', () => {
    it('should_updateFuelUnits_when_fuelUnitChanged', async () => {
      // Arrange
      vehicle.settings.fuelUnit = 'gallonUS';
      const mockStatus: VehicleStatus = {
        vin: 'TEST123',
        driveTrain: 'COMBUSTION',
        currentMileage: 15000,
      } as VehicleStatus;
      mockStateManager.getVehicleStatus.mockReturnValue(mockStatus);

      const newSettings = { fuelUnit: 'gallonUS' };
      const changedKeys = ['fuelUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setFuelUnits']).toHaveBeenCalledWith('gallonUS');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(mockStatus);
      expect(mockApp.logger.info).toHaveBeenCalledWith('Fuel unit changed.');
    });

    it('should_updateFuelUnitsToLiter_when_fuelUnitChangedToLiter', async () => {
      // Arrange
      vehicle.settings.fuelUnit = 'liter';
      const mockStatus: VehicleStatus = {
        vin: 'TEST123',
        driveTrain: 'COMBUSTION',
        currentMileage: 20000,
      } as VehicleStatus;
      mockStateManager.getVehicleStatus.mockReturnValue(mockStatus);

      const newSettings = { fuelUnit: 'liter' };
      const changedKeys = ['fuelUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setFuelUnits']).toHaveBeenCalledWith('liter');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(mockStatus);
    });

    it('should_notUpdateCapabilities_when_fuelUnitChangedButNoStatus', async () => {
      // Arrange
      vehicle.settings.fuelUnit = 'gallonUK';
      mockStateManager.getVehicleStatus.mockReturnValue(null);

      const newSettings = { fuelUnit: 'gallonUK' };
      const changedKeys = ['fuelUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setFuelUnits']).toHaveBeenCalledWith('gallonUK');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(null);
    });
  });

  describe('Combined Settings Changes', () => {
    it('should_updateBothDistanceAndFuelUnits_when_bothChanged', async () => {
      // Arrange
      vehicle.settings.distanceUnit = 'imperial';
      vehicle.settings.fuelUnit = 'gallonUS';
      const mockStatus = {
        vin: 'TEST123',
        driveTrain: 'PHEV',
        currentMileage: 25000,
      } as unknown as VehicleStatus;
      mockStateManager.getVehicleStatus.mockReturnValue(mockStatus);

      const newSettings = { distanceUnit: 'imperial', fuelUnit: 'gallonUS' };
      const changedKeys = ['distanceUnit', 'fuelUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['setDistanceUnits']).toHaveBeenCalledWith('imperial');
      expect(vehicle['setFuelUnits']).toHaveBeenCalledWith('gallonUS');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledTimes(1); // Only once
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(mockStatus);
    });

    it('should_handleAllSettingsChanges_when_multipleKeysChanged', async () => {
      // Arrange
      vehicle.settings.apiPollingEnabled = true;
      vehicle.settings.streamingEnabled = true;
      vehicle.settings.distanceUnit = 'metric';
      const mockStatus: VehicleStatus = {
        vin: 'TEST123',
        driveTrain: 'ELECTRIC',
        currentMileage: 30000,
      } as VehicleStatus;
      mockStateManager.getVehicleStatus.mockReturnValue(mockStatus);

      const newSettings = {
        apiPollingEnabled: true,
        streamingEnabled: true,
        distanceUnit: 'metric',
      };
      const changedKeys = ['apiPollingEnabled', 'streamingEnabled', 'distanceUnit'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['startApiPolling']).toHaveBeenCalled();
      expect(vehicle['initializeMqttStreaming']).toHaveBeenCalled();
      expect(vehicle['setDistanceUnits']).toHaveBeenCalledWith('metric');
      expect(vehicle['updateCapabilitiesFromStatus']).toHaveBeenCalledWith(mockStatus);
    });
  });

  describe('No Changes Scenario', () => {
    it('should_notPerformAnyAction_when_noKeysChanged', async () => {
      // Arrange
      const newSettings = {};
      const changedKeys: string[] = [];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['startApiPolling']).not.toHaveBeenCalled();
      expect(vehicle['stopApiPolling']).not.toHaveBeenCalled();
      expect(vehicle['initializeMqttStreaming']).not.toHaveBeenCalled();
      expect(vehicle['setDistanceUnits']).not.toHaveBeenCalled();
      expect(vehicle['setFuelUnits']).not.toHaveBeenCalled();
      expect(vehicle['updateCapabilitiesFromStatus']).not.toHaveBeenCalled();
    });

    it('should_notPerformAnyAction_when_irrelevantKeysChanged', async () => {
      // Arrange
      const newSettings = { someOtherSetting: 'value' };
      const changedKeys = ['someOtherSetting'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle['startApiPolling']).not.toHaveBeenCalled();
      expect(vehicle['stopApiPolling']).not.toHaveBeenCalled();
      expect(vehicle['initializeMqttStreaming']).not.toHaveBeenCalled();
      expect(vehicle['setDistanceUnits']).not.toHaveBeenCalled();
      expect(vehicle['setFuelUnits']).not.toHaveBeenCalled();
      expect(vehicle['updateCapabilitiesFromStatus']).not.toHaveBeenCalled();
    });
  });

  describe('Settings Merge', () => {
    it('should_mergeNewSettingsWithExisting_when_called', async () => {
      // Arrange
      vehicle.settings = {
        currentVersion: '1.0.0',
        apiPollingEnabled: false,
        apiPollingInterval: 30,
        streamingEnabled: false,
        distanceUnit: 'metric',
        fuelUnit: 'liter',
        locationUpdateThreshold: 100,
        refuellingTriggerThreshold: 5,
        autoRetry: false,
      };

      const newSettings = {
        apiPollingEnabled: true,
        apiPollingInterval: 60,
      };
      const changedKeys = ['apiPollingEnabled', 'apiPollingInterval'];

      // Act
      await vehicle.onSettings({ newSettings, changedKeys });

      // Assert
      expect(vehicle.settings.apiPollingEnabled).toBe(true);
      expect(vehicle.settings.apiPollingInterval).toBe(60);
      expect(vehicle.settings.distanceUnit).toBe('metric'); // Unchanged
      expect(vehicle.settings.fuelUnit).toBe('liter'); // Unchanged
    });
  });
});
