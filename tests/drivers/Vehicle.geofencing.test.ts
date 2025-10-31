/**
 * Tests for Vehicle Geofencing and Location Methods
 *
 * Validates checkGeofence and onLocationChanged methods.
 * Tests geofence detection, location updates, and flow card triggering.
 */

import { Vehicle } from '../../drivers/Vehicle';
import { DeviceSettings } from '../../utils/DeviceSettings';
import { LocationType } from '../../utils/LocationType';
import { ConfigurationManager } from '../../utils/ConfigurationManager';
import { Configuration } from '../../utils/Configuration';
import * as geo from 'geolocation-utils';

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
    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

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

    // Create mock app
    mockApp = {
      logger: mockLogger,
      currentLocation: undefined,
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

    // Create Vehicle instance bypassing constructor
    vehicle = Object.create(Vehicle.prototype);
    vehicle.app = mockApp;
    vehicle.logger = mockLogger;
    vehicle.homey = mockHomey;
    vehicle.deviceData = { id: 'TEST_VIN_123' };
    vehicle.settings = new DeviceSettings();
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

  describe('onLocationChanged', () => {
    beforeEach(() => {
      (geo.insideCircle as jest.Mock).mockReturnValue(false);
      vehicle['getCapabilityValueSafe'] = jest.fn().mockResolvedValue(12345);
    });

    it('should_triggerLocationChangedFlowCard_when_locationChanges', async () => {
      // Arrange
      const newLocation: LocationType = {
        label: '',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 New St',
      };

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockFlowCards.location_changed.trigger).toHaveBeenCalledWith(vehicle, newLocation, {});
      expect(mockLogger.info).toHaveBeenCalledWith('Location changed.');
    });

    it('should_updateStateManagerLastLocation_when_locationChanges', async () => {
      // Arrange
      const newLocation: LocationType = {
        label: '',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 New St',
      };

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockStateManager.setLastLocation).toHaveBeenCalledWith(newLocation);
    });

    it('should_triggerGeofenceEnter_when_enteringGeofence', async () => {
      // Arrange
      const previousLocation: LocationType = {
        label: '',
        latitude: 52.0,
        longitude: 0.0,
        address: 'Old Address',
      };
      mockStateManager.getLastLocation.mockReturnValue(previousLocation);

      const newLocation: LocationType = {
        label: '',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 Home St',
      };

      // Mock insideCircle for geofence checks:
      // 1st call: checkGeofence(newLocation) checks Home → true (sets label='Home', stops)
      // 2nd call: checkGeofence(oldLocation) checks Home → false
      // 3rd call: checkGeofence(oldLocation) checks Work → false (stays outside)
      (geo.insideCircle as jest.Mock)
        .mockReturnValueOnce(true) // newLocation inside Home
        .mockReturnValueOnce(false) // oldLocation not in Home
        .mockReturnValueOnce(false); // oldLocation not in Work

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(newLocation.label).toBe('Home');
      expect(mockFlowCards.geo_fence_enter.trigger).toHaveBeenCalledWith(
        vehicle,
        expect.objectContaining({ label: 'Home' }),
        {}
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Entered geofence.');
    });

    it('should_triggerGeofenceExit_when_leavingGeofence', async () => {
      // Arrange
      const previousLocation: LocationType = {
        label: 'Home',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 Home St',
      };
      mockStateManager.getLastLocation.mockReturnValue(previousLocation);

      const newLocation: LocationType = {
        label: '',
        latitude: 52.0,
        longitude: 0.0,
        address: 'Far Away',
      };

      // Mock insideCircle to return true only for oldLocation+Home geofence
      (geo.insideCircle as jest.Mock).mockImplementation((location: LocationType, fence: any) => {
        // Old location (51.5074, -0.1278) inside Home fence only
        if (
          location.latitude === 51.5074 &&
          location.longitude === -0.1278 &&
          fence.label === 'Home'
        ) {
          return true;
        }
        return false;
      });

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_exit.trigger).toHaveBeenCalledWith(
        vehicle,
        expect.objectContaining({ label: 'Home' }),
        {}
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Exit geofence.');
    });

    it('should_triggerBothEnterAndExit_when_movingBetweenGeofences', async () => {
      // Arrange
      const previousLocation: LocationType = {
        label: 'Home',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 Home St',
      };
      mockStateManager.getLastLocation.mockReturnValue(previousLocation);

      const newLocation: LocationType = {
        label: '',
        latitude: 51.5134,
        longitude: -0.0896,
        address: '456 Work Ave',
      };

      // Mock insideCircle based on location and fence
      (geo.insideCircle as jest.Mock).mockImplementation((location: LocationType, fence: any) => {
        // New location (51.5134, -0.0896) inside Work fence only
        if (
          location.latitude === 51.5134 &&
          location.longitude === -0.0896 &&
          fence.label === 'Work'
        ) {
          return true;
        }
        // Old location (51.5074, -0.1278) inside Home fence only
        if (
          location.latitude === 51.5074 &&
          location.longitude === -0.1278 &&
          fence.label === 'Home'
        ) {
          return true;
        }
        return false;
      });

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_exit.trigger).toHaveBeenCalledWith(
        vehicle,
        expect.objectContaining({ label: 'Home' }),
        {}
      );
      expect(mockFlowCards.geo_fence_enter.trigger).toHaveBeenCalledWith(
        vehicle,
        expect.objectContaining({ label: 'Work' }),
        {}
      );
    });

    it('should_notTriggerGeofenceCards_when_noGeofenceChange', async () => {
      // Arrange
      const previousLocation: LocationType = {
        label: '',
        latitude: 52.0,
        longitude: 0.0,
        address: 'Somewhere',
      };
      mockStateManager.getLastLocation.mockReturnValue(previousLocation);

      const newLocation: LocationType = {
        label: '',
        latitude: 52.1,
        longitude: 0.1,
        address: 'Still Outside',
      };

      (geo.insideCircle as jest.Mock).mockReturnValue(false); // Both outside

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_enter.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.geo_fence_exit.trigger).not.toHaveBeenCalled();
    });

    it('should_notTriggerDriveSessionCompleted_when_locationChanges', async () => {
      // Arrange
      const previousLocation: LocationType = {
        label: 'Home',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 Home St',
      };
      mockStateManager.getLastLocation.mockReturnValue(previousLocation);

      const newLocation: LocationType = {
        label: '',
        latitude: 51.5134,
        longitude: -0.0896,
        address: '456 Work Ave',
      };

      (geo.insideCircle as jest.Mock).mockImplementation((location: LocationType, fence: any) => {
        if (
          location.latitude === 51.5134 &&
          location.longitude === -0.0896 &&
          fence.label === 'Work'
        ) {
          return true;
        }
        if (
          location.latitude === 51.5074 &&
          location.longitude === -0.1278 &&
          fence.label === 'Home'
        ) {
          return true;
        }
        return false;
      });

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_exit.trigger).toHaveBeenCalledWith(
        vehicle,
        expect.objectContaining({ label: 'Home' }),
        {}
      );
      expect(mockFlowCards.geo_fence_enter.trigger).toHaveBeenCalledWith(
        vehicle,
        expect.objectContaining({ label: 'Work' }),
        {}
      );
      expect(mockFlowCards.drive_session_completed.trigger).not.toHaveBeenCalled();
    });

    it('should_handleNoPreviousLocation_when_firstLocationUpdate', async () => {
      // Arrange
      mockStateManager.getLastLocation.mockReturnValue(undefined);

      const newLocation: LocationType = {
        label: '',
        latitude: 51.5074,
        longitude: -0.1278,
        address: 'First Location',
      };

      (geo.insideCircle as jest.Mock).mockReturnValue(false);

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(mockFlowCards.location_changed.trigger).toHaveBeenCalledWith(vehicle, newLocation, {});
      expect(mockFlowCards.geo_fence_enter.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.geo_fence_exit.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.drive_session_completed.trigger).not.toHaveBeenCalled();
    });

    it('should_notTriggerGeofenceFlows_when_stayingWithinSameGeofence', async () => {
      // Arrange
      const previousLocation: LocationType = {
        label: 'Home',
        latitude: 51.5074,
        longitude: -0.1278,
        address: '123 Home St',
      };
      mockStateManager.getLastLocation.mockReturnValue(previousLocation);

      const newLocation: LocationType = {
        label: '',
        latitude: 51.5075,
        longitude: -0.1279,
        address: 'Nearby Home St',
      };

      (geo.insideCircle as jest.Mock).mockImplementation((_location: LocationType, fence: any) => {
        if (fence.label === 'Home') {
          return true;
        }
        return false;
      });

      // Act
      await vehicle['onLocationChanged'](newLocation);

      // Assert
      expect(newLocation.label).toBe('Home');
      expect(mockFlowCards.geo_fence_enter.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.geo_fence_exit.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.drive_session_completed.trigger).not.toHaveBeenCalled();
    });
  });
});
