/**
 * Tests for Vehicle Location Flow Logic
 *
 * Tests the refactored location handling that was previously in onLocationChanged.
 * Location changes are now handled inline in updateCapabilitiesFromStatus with:
 * - Two-location tracking (currentLocation vs lastFlowLocation)
 * - shouldTriggerLocationFlows() - decision logic
 * - triggerLocationFlows() - flow card triggering
 * - drive_session_started flow when first moving while not driving
 */

import { Vehicle } from '../../drivers/Vehicle';
import { LocationType } from '../../utils/LocationType';
import * as geo from 'geolocation-utils';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';

// Mock geolocation-utils
jest.mock('geolocation-utils');

describe('Vehicle Location Flows', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockFlowCards: any;
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
      drive_session_started: {
        trigger: jest.fn().mockResolvedValue(undefined),
      },
    };

    // Create vehicle instance using helper
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;

    // Create mock state manager with all required methods
    mockStateManager = {
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getLastFlowTriggeredLocation: jest.fn().mockReturnValue(null),
      setLastFlowTriggeredLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteLocation: jest.fn().mockReturnValue(null),
      setLastTripCompleteLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteMileage: jest.fn().mockReturnValue(0),
      setLastTripCompleteMileage: jest.fn().mockResolvedValue(undefined),
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
    };
    vehicle['stateManager'] = mockStateManager;

    // Mock homey with flow cards and settings
    vehicle.homey = {
      app: mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardId: string) => {
          return mockFlowCards[cardId] || { trigger: jest.fn() };
        }),
      },
      settings: {
        get: jest.fn().mockReturnValue(null), // No geofences
      },
    } as any;

    // Mock checkGeofence to do nothing by default
    jest.spyOn(vehicle as any, 'checkGeofence').mockResolvedValue(undefined);

    // Mock distanceTo to return distance > threshold by default (100m)
    (geo.distanceTo as jest.Mock).mockReturnValue(100);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldTriggerLocationFlows', () => {
    it('should_returnTrue_when_noPreviousLocation', () => {
      // Arrange
      const newLocation: LocationType = {
        label: '',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      };

      // Act
      const result = vehicle['shouldTriggerLocationFlows'](undefined, newLocation);

      // Assert
      expect(result).toBe(true);
    });

    it('should_returnTrue_when_geofenceChanged', () => {
      // Arrange
      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      };
      const newLocation: LocationType = {
        label: 'Work',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin',
      };

      // Act
      const result = vehicle['shouldTriggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(result).toBe(true);
    });

    it('should_returnTrue_when_distanceAboveThreshold', () => {
      // Arrange
      const oldLocation: LocationType = {
        label: '',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      };
      const newLocation: LocationType = {
        label: '',
        latitude: 52.521,
        longitude: 13.406,
        address: 'Berlin',
      };

      (geo.distanceTo as jest.Mock).mockReturnValue(60); // > 50m threshold

      // Act
      const result = vehicle['shouldTriggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(result).toBe(true);
      expect(geo.distanceTo).toHaveBeenCalledWith(
        { latitude: newLocation.latitude, longitude: newLocation.longitude },
        { latitude: oldLocation.latitude, longitude: oldLocation.longitude }
      );
    });

    it('should_returnFalse_when_distanceBelowThresholdAndNoGeofenceChange', () => {
      // Arrange
      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      };
      const newLocation: LocationType = {
        label: 'Home', // Same geofence
        latitude: 52.5201,
        longitude: 13.4051,
        address: 'Berlin',
      };

      (geo.distanceTo as jest.Mock).mockReturnValue(30); // < 50m threshold

      // Act
      const result = vehicle['shouldTriggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(result).toBe(false);
    });

    it('should_prioritizeGeofenceChange_overDistanceThreshold', () => {
      // Arrange - Distance < threshold but geofence changed
      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      };
      const newLocation: LocationType = {
        label: 'Work', // Different geofence
        latitude: 52.5201,
        longitude: 13.4051,
        address: 'Berlin',
      };

      (geo.distanceTo as jest.Mock).mockReturnValue(20); // < 50m threshold

      // Act
      const result = vehicle['shouldTriggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(result).toBe(true);
      // Geofence change returns early, so distance value doesn't matter
      // (but the function still calculates it after the early return is already taken)
    });
  });

  describe('triggerLocationFlows', () => {
    it('should_triggerDriveSessionStarted_when_notDriving', async () => {
      // Arrange
      mockStateManager.getIsDriving.mockReturnValue(false);
      mockStateManager.getLastTripCompleteLocation.mockReturnValue({
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      });
      mockStateManager.getLastTripCompleteMileage.mockReturnValue(10000);

      const triggerDriveSessionStartedSpy = jest
        .spyOn(vehicle as any, 'triggerDriveSessionStarted')
        .mockResolvedValue(undefined);

      const newLocation: LocationType = {
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Mitte',
      };

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert
      expect(triggerDriveSessionStartedSpy).toHaveBeenCalled();
      expect(mockStateManager.getIsDriving).toHaveBeenCalled();
    });

    it('should_notTriggerDriveSessionStarted_when_alreadyDriving', async () => {
      // Arrange
      mockStateManager.getIsDriving.mockReturnValue(true);

      const triggerDriveSessionStartedSpy = jest
        .spyOn(vehicle as any, 'triggerDriveSessionStarted')
        .mockResolvedValue(undefined);

      const newLocation: LocationType = {
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin',
      };

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert
      expect(triggerDriveSessionStartedSpy).not.toHaveBeenCalled();
    });

    it('should_alwaysTriggerLocationChangedFlow', async () => {
      // Arrange
      const newLocation: LocationType = {
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin',
      };

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert
      expect(mockFlowCards.location_changed.trigger).toHaveBeenCalledWith(vehicle, newLocation, {});
    });

    it('should_triggerGeofenceEnter_when_enteringLabeledZone', async () => {
      // Arrange
      const oldLocation: LocationType = {
        label: '', // No geofence
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin',
      };
      const newLocation: LocationType = {
        label: 'Home', // Entered Home geofence
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Home',
      };

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_enter.trigger).toHaveBeenCalledWith(vehicle, newLocation, {});
      expect(mockFlowCards.geo_fence_exit.trigger).not.toHaveBeenCalled();
    });

    it('should_triggerGeofenceExit_when_leavingLabeledZone', async () => {
      // Arrange
      const oldLocation: LocationType = {
        label: 'Home', // Was in Home geofence
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };
      const newLocation: LocationType = {
        label: '', // Left geofence
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin',
      };

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_exit.trigger).toHaveBeenCalledWith(vehicle, oldLocation, {});
      expect(mockFlowCards.geo_fence_enter.trigger).not.toHaveBeenCalled();
    });

    it('should_triggerBothEnterAndExit_when_movingBetweenGeofences', async () => {
      // Arrange
      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };
      const newLocation: LocationType = {
        label: 'Work',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Work',
      };

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_exit.trigger).toHaveBeenCalledWith(vehicle, oldLocation, {});
      expect(mockFlowCards.geo_fence_enter.trigger).toHaveBeenCalledWith(vehicle, newLocation, {});
    });

    it('should_notTriggerGeofenceFlows_when_stayingInSameGeofence', async () => {
      // Arrange
      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };
      const newLocation: LocationType = {
        label: 'Home', // Still in Home
        latitude: 52.5201,
        longitude: 13.4051,
        address: 'Berlin Home',
      };

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_enter.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.geo_fence_exit.trigger).not.toHaveBeenCalled();
    });

    it('should_notTriggerGeofenceFlows_when_noPreviousLocation', async () => {
      // Arrange
      const newLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert
      expect(mockFlowCards.geo_fence_enter.trigger).not.toHaveBeenCalled();
      expect(mockFlowCards.geo_fence_exit.trigger).not.toHaveBeenCalled();
    });
  });

  describe('updateCapabilitiesFromStatus (Location Integration)', () => {
    it('should_updateLocationState_and_triggerFlows_when_locationInStatus', async () => {
      // Arrange
      const checkGeofenceSpy = jest
        .spyOn(vehicle as any, 'checkGeofence')
        .mockResolvedValue(undefined);
      const shouldTriggerSpy = jest
        .spyOn(vehicle as any, 'shouldTriggerLocationFlows')
        .mockReturnValue(true);
      const triggerFlowsSpy = jest
        .spyOn(vehicle as any, 'triggerLocationFlows')
        .mockResolvedValue(undefined);

      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };
      mockStateManager.getLastLocation.mockReturnValue(oldLocation);
      mockStateManager.getLastFlowTriggeredLocation.mockReturnValue(oldLocation);

      const status: VehicleStatus = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        location: {
          coordinates: {
            latitude: 52.53,
            longitude: 13.406,
          },
          address: {
            formatted: 'Berlin Work',
          },
        },
      };

      // Act
      await vehicle['updateCapabilitiesFromStatus'](status);

      // Assert
      expect(checkGeofenceSpy).toHaveBeenCalledWith({
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Work',
      });
      expect(mockStateManager.setLastLocation).toHaveBeenCalledWith({
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Work',
      });
      expect(shouldTriggerSpy).toHaveBeenCalledWith(oldLocation, {
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Work',
      });
      expect(triggerFlowsSpy).toHaveBeenCalledWith(oldLocation, {
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Work',
      });
      expect(mockStateManager.setLastFlowTriggeredLocation).toHaveBeenCalledWith({
        label: '',
        latitude: 52.53,
        longitude: 13.406,
        address: 'Berlin Work',
      });
    });

    it('should_notTriggerFlows_when_shouldTriggerReturnsFalse', async () => {
      // Arrange
      jest.spyOn(vehicle as any, 'checkGeofence').mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'shouldTriggerLocationFlows').mockReturnValue(false);
      const triggerFlowsSpy = jest
        .spyOn(vehicle as any, 'triggerLocationFlows')
        .mockResolvedValue(undefined);

      const oldLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };
      mockStateManager.getLastLocation.mockReturnValue(oldLocation);
      mockStateManager.getLastFlowTriggeredLocation.mockReturnValue(oldLocation);

      const status: VehicleStatus = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        location: {
          coordinates: {
            latitude: 52.5201, // Small movement
            longitude: 13.4051,
          },
          address: {
            formatted: 'Berlin Home',
          },
        },
      };

      // Act
      await vehicle['updateCapabilitiesFromStatus'](status);

      // Assert
      expect(mockStateManager.setLastLocation).toHaveBeenCalled(); // Always persisted
      expect(triggerFlowsSpy).not.toHaveBeenCalled();
      expect(mockStateManager.setLastFlowTriggeredLocation).not.toHaveBeenCalled();
    });

    it('should_useTwoLocationTracking_currentVsLastFlow', async () => {
      // Arrange
      jest.spyOn(vehicle as any, 'checkGeofence').mockResolvedValue(undefined);
      const shouldTriggerSpy = jest
        .spyOn(vehicle as any, 'shouldTriggerLocationFlows')
        .mockReturnValue(true);
      jest.spyOn(vehicle as any, 'triggerLocationFlows').mockResolvedValue(undefined);

      const currentLocation: LocationType = {
        label: 'Transit',
        latitude: 52.525,
        longitude: 13.4055,
        address: 'Berlin Transit',
      };
      const lastFlowLocation: LocationType = {
        label: 'Home',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin Home',
      };

      mockStateManager.getLastLocation.mockReturnValue(currentLocation);
      mockStateManager.getLastFlowTriggeredLocation.mockReturnValue(lastFlowLocation);

      const status: VehicleStatus = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        location: {
          coordinates: {
            latitude: 52.53,
            longitude: 13.406,
          },
          address: {
            formatted: 'Berlin Work',
          },
        },
      };

      // Act
      await vehicle['updateCapabilitiesFromStatus'](status);

      // Assert
      // Should compare new location against lastFlowLocation, not currentLocation
      expect(shouldTriggerSpy).toHaveBeenCalledWith(lastFlowLocation, expect.any(Object));
    });
  });
});
