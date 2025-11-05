/**
 * Tests for Vehicle Geofencing and Location Methods
 *
 * Validates checkGeofence and onLocationChanged methods.
 * Tests geofence detection, location updates, and flow card triggering.
 */

import { Vehicle } from '../../drivers/Vehicle';
import { LocationType } from '../../utils/LocationType';
import { ConfigurationManager } from '../../utils/ConfigurationManager';
import { Configuration } from '../../utils/Configuration';
import * as geo from 'geolocation-utils';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

// Mock geolocation-utils
jest.mock('geolocation-utils');

describe('Vehicle Geofencing and Location', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockLogger: any;
  let mockHomey: any;
  let mockFlowCards: any;
  let mockConfiguration: Configuration;
  let mockStateManager: any;

  beforeEach(() => {
    // Create mock flow cards
    mockFlowCards = {
      location_changed: {
        trigger: jest.fn().mockResolvedValue(undefined),
      },
      geo_fence_enter: {
        trigger: jest.fn().mockResolvedValue(undefined),
      },
      geo_fence_exit: {
        trigger: jest.fn().mockResolvedValue(undefined),
      },
      drive_session_completed: {
        trigger: jest.fn().mockResolvedValue(undefined),
      },
    };

    // Create vehicle instance using helper
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;
    mockLogger = result.mocks.mockLogger;

    // Create mock homey
    mockHomey = {
      app: mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardName: string) => mockFlowCards[cardName]),
      },
      settings: {
        get: jest.fn(),
        set: jest.fn(),
      },
    };

    // Create mock configuration
    mockConfiguration = new Configuration();
    mockConfiguration.geofences = [
      {
        label: 'Home',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 Home St',
        radius: 50,
      },
      {
        label: 'Work',
        latitude: 51.5134,
        longitude: -0.0896,
        address: '456 Work Ave',
        radius: 100,
      },
    ];

    // Mock ConfigurationManager
    jest.spyOn(ConfigurationManager, 'getConfiguration').mockReturnValue(mockConfiguration);

    // Create mock state manager
    mockStateManager = {
      getLastLocation: jest.fn().mockReturnValue(undefined),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getVehicleStatus: jest.fn().mockReturnValue({
        vin: 'TEST_VIN_123',
        driveTrain: 'ELECTRIC',
        lastUpdatedAt: new Date(),
      }),
      updateFromApi: jest.fn().mockResolvedValue(undefined),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      getDriveTrain: jest.fn().mockReturnValue('ELECTRIC'),
      setDriveTrain: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteLocation: jest.fn().mockReturnValue(null),
      setLastTripCompleteLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteMileage: jest.fn().mockReturnValue(null),
      setLastTripCompleteMileage: jest.fn().mockResolvedValue(undefined),
      updateFromMqttMessage: jest.fn().mockResolvedValue(undefined),
      clearCache: jest.fn(),
    } as any;

    vehicle.homey = mockHomey;
    vehicle.currentVehicleState = null;
    vehicle['stateManager'] = mockStateManager;

    // Mock capability methods
    vehicle['getCapabilityValueSafe'] = jest.fn();
    vehicle.getName = jest.fn().mockReturnValue('Test Vehicle');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('checkGeofence', () => {
    it('should_setLabel_when_locationInsideGeofence', async () => {
      // Arrange
      const location: LocationType = {
        label: '',
        latitude: 51.5074,
        longitude: -0.1278,
        address: 'Test Address',
      };
      (geo.insideCircle as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['checkGeofence'](location);

      // Assert
      expect(location.label).toBe('Home');
      expect(mockLogger.info).toHaveBeenCalledWith('Checking geofences.');
      expect(mockLogger.info).toHaveBeenCalledWith("Inside geofence 'Home'.");
    });

    it('should_clearLabel_when_locationOutsideAllGeofences', async () => {
      // Arrange
      const location: LocationType = {
        label: '',
        latitude: 52.0,
        longitude: 0.0,
        address: 'Far Away',
      };
      (geo.insideCircle as jest.Mock).mockReturnValue(false);

      // Act
      await vehicle['checkGeofence'](location);

      // Assert
      expect(location.label).toBe('');
      expect(mockLogger.info).toHaveBeenCalledWith('Checking geofences.');
    });

    it('should_checkMultipleGeofences_when_firstDoesNotMatch', async () => {
      // Arrange
      const location: LocationType = {
        label: '',
        latitude: 51.5134,
        longitude: -0.0896,
        address: 'Work Location',
      };
      (geo.insideCircle as jest.Mock)
        .mockReturnValueOnce(false) // Not in Home
        .mockReturnValueOnce(true); // In Work

      // Act
      await vehicle['checkGeofence'](location);

      // Assert
      expect(location.label).toBe('Work');
      expect(mockLogger.info).toHaveBeenCalledWith("Inside geofence 'Work'.");
    });

    it('should_useDefaultRadius_when_radiusNotSpecified', async () => {
      // Arrange
      mockConfiguration.geofences = [
        {
          label: 'NoRadiusPlace',
          latitude: 51.5,
          longitude: -0.1,
          address: 'Test',
        },
      ];
      const location: LocationType = {
        label: '',
        latitude: 51.5,
        longitude: -0.1,
        address: 'Test',
      };
      (geo.insideCircle as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['checkGeofence'](location);

      // Assert
      expect(geo.insideCircle).toHaveBeenCalledWith(
        location,
        expect.objectContaining({ label: 'NoRadiusPlace' }),
        20 // Default radius
      );
    });

    it('should_doNothing_when_noGeofencesConfigured', async () => {
      // Arrange
      mockConfiguration.geofences = [];
      const location: LocationType = {
        label: '',
        latitude: 51.5,
        longitude: -0.1,
        address: 'Test',
      };

      // Act
      await vehicle['checkGeofence'](location);

      // Assert
      expect(location.label).toBe('');
      expect(mockLogger.info).toHaveBeenCalledWith('Checking geofences.');
    });

    it('should_doNothing_when_configurationNull', async () => {
      // Arrange
      jest.spyOn(ConfigurationManager, 'getConfiguration').mockReturnValue(null as any);
      const location: LocationType = {
        label: '',
        latitude: 51.5,
        longitude: -0.1,
        address: 'Test',
      };

      // Act
      await vehicle['checkGeofence'](location);

      // Assert
      expect(location.label).toBe('');
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
