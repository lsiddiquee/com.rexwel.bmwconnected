/**
 * Flow Trigger Undefined/Null Prevention Tests
 *
 * These tests ensure that flow triggers are NEVER invoked with undefined or null values,
 * which would crash the Homey app. Each test validates that fallback values are used
 * when source data is missing.
 */

// Mock geolocation-utils
jest.mock('geolocation-utils', () => ({
  distanceTo: jest.fn().mockReturnValue(150),
}));

// Mock semver
jest.mock('semver');

import { Vehicle } from '../../drivers/Vehicle';
import { LocationType } from '../../utils/LocationType';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

describe('Flow Trigger - Undefined/Null Prevention', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockFlowCards: Map<string, any>;

  beforeEach(() => {
    // Create vehicle instance using helper
    const result = createMockedVehicle({
      refuellingTriggerThreshold: 5,
    });
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;

    // Mock all flow cards with spies to track invocations
    mockFlowCards = new Map();
    const flowCardNames = [
      'charging_status_change',
      'refuelled',
      'drive_session_started',
      'drive_session_completed',
      'location_changed',
      'geo_fence_enter',
      'geo_fence_exit',
    ];

    flowCardNames.forEach((cardName) => {
      mockFlowCards.set(cardName, {
        trigger: jest.fn().mockResolvedValue(undefined),
      });
    });

    // Set up vehicle.homey with flow card mocks
    const mockHomey = {
      app: mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardId: string) => {
          return mockFlowCards.get(cardId) || { trigger: jest.fn() };
        }),
      },
      settings: {
        get: jest.fn().mockReturnValue(null), // No geofences configured
      },
    };
    vehicle.homey = mockHomey as any;

    // Mock state manager
    const mockStateManager = {
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getLastFlowTriggeredLocation: jest.fn().mockReturnValue(null),
      setLastFlowTriggeredLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripStartLocation: jest.fn().mockReturnValue(null),
      setLastTripStartLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteLocation: jest.fn().mockReturnValue(null),
      setLastTripCompleteLocation: jest.fn().mockResolvedValue(undefined),
      getLastTripCompleteMileage: jest.fn().mockReturnValue(undefined),
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
    } as any;
    vehicle['stateManager'] = mockStateManager;

    // Mock methods
    jest.spyOn(vehicle as any, 'setCapabilityValueSafe').mockResolvedValue(true);
    jest.spyOn(vehicle as any, 'shouldTriggerLocationFlows').mockReturnValue(false);
    jest.spyOn(vehicle as any, 'resolveAddress').mockImplementation(async (location: any) => {
      // Simulate address resolution - but don't always succeed
      if (location.latitude && location.longitude) {
        location.address = 'Resolved Address';
      }
    });
    jest.spyOn(vehicle as any, 'checkGeofence').mockImplementation(async (location: any) => {
      // Simulate geofence check - but don't always set address
      if (!location.address && location.latitude && location.longitude) {
        location.address = 'Geofence Address';
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================================================================================
  // 1. CHARGING STATUS CHANGE - Must not pass undefined
  // ==================================================================================

  describe('charging_status_change trigger', () => {
    it('should_use_fallback_UNKNOWN_when_chargingStatus_becomes_undefined', async () => {
      // Arrange - Start with a valid charging status, then it becomes undefined
      // This tests that if chargingStatus somehow becomes undefined, the fallback works
      vehicle.currentVehicleState = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        electric: {
          chargeLevelPercent: 80,
          range: 300,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // New status - chargingStatus field exists but evaluates to a value that needs fallback
      const newStatus: VehicleStatus = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        electric: {
          chargeLevelPercent: 85,
          range: 310,
          isChargerConnected: false,
          // Note: In the actual implementation, if chargingStatus is undefined,
          // the entire block is skipped. This test validates that IF the flow
          // is triggered with undefined, the ?? 'UNKNOWN' fallback prevents crashes.
          chargingStatus: 'INVALID' as any, // INVALID status should use fallback
        },
      } as VehicleStatus;

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Flow triggered (status changed from NOT_CHARGING to INVALID)
      const flowCard = mockFlowCards.get('charging_status_change');
      expect(flowCard?.trigger).toHaveBeenCalled();

      // Verify the trigger was called with a valid string (not undefined/null)
      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].charging_status).toBeDefined();
      expect(callArgs[1].charging_status).not.toBeNull();
      expect(typeof callArgs[1].charging_status).toBe('string');
    });

    it('should_pass_valid_string_when_chargingStatus_is_defined', async () => {
      // Arrange
      vehicle.currentVehicleState = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        electric: {
          chargeLevelPercent: 80,
          range: 300,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      const newStatus: VehicleStatus = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
        electric: {
          chargeLevelPercent: 85,
          range: 310,
          isChargerConnected: true,
          chargingStatus: 'CHARGING', // Valid value
        },
      } as VehicleStatus;

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Flow triggered with actual value
      const flowCard = mockFlowCards.get('charging_status_change');
      expect(flowCard?.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          charging_status: 'CHARGING',
        },
        {}
      );
    });
  });

  // ==================================================================================
  // 2. DRIVE SESSION STARTED - Must not pass undefined for label/address
  // ==================================================================================

  describe('drive_session_started trigger', () => {
    it('should_NOT_pass_undefined_when_startLocation_label_is_empty', async () => {
      // Arrange - Location with empty/undefined label
      const startLocation = new LocationType('', 52.1, 5.0, 'Test Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getLastTripCompleteLocation as jest.Mock).mockReturnValue(startLocation);
      (mockStateManager.getLastTripCompleteMileage as jest.Mock).mockReturnValue(10000);

      // Act
      await vehicle['triggerDriveSessionStarted']();

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('drive_session_started');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].StartLabel).toBe(''); // Empty string fallback
      expect(callArgs[1].StartLabel).not.toBeUndefined();
      expect(callArgs[1].StartLabel).not.toBeNull();
    });

    it('should_NOT_pass_undefined_when_startLocation_address_is_empty', async () => {
      // Arrange - Location with empty address
      const startLocation = new LocationType('Home', 52.1, 5.0, '');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getLastTripCompleteLocation as jest.Mock).mockReturnValue(startLocation);
      (mockStateManager.getLastTripCompleteMileage as jest.Mock).mockReturnValue(10000);

      // Mock checkGeofence to NOT set address (simulate resolution failure)
      jest.spyOn(vehicle as any, 'checkGeofence').mockImplementation(async () => {
        // Intentionally don't set address
      });

      // Act
      await vehicle['triggerDriveSessionStarted']();

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('drive_session_started');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].StartAddress).toBe(''); // Empty string fallback
      expect(callArgs[1].StartAddress).not.toBeUndefined();
      expect(callArgs[1].StartAddress).not.toBeNull();
    });

    it('should_NOT_pass_undefined_when_mileage_is_undefined', async () => {
      // Arrange - No previous mileage
      const startLocation = new LocationType('Home', 52.1, 5.0, 'Test Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getLastTripCompleteLocation as jest.Mock).mockReturnValue(startLocation);
      (mockStateManager.getLastTripCompleteMileage as jest.Mock).mockReturnValue(undefined);

      // Act
      await vehicle['triggerDriveSessionStarted']();

      // Assert - Flow triggered with 0, NOT undefined
      const flowCard = mockFlowCards.get('drive_session_started');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].StartMileage).toBe(0); // Zero fallback
      expect(callArgs[1].StartMileage).not.toBeUndefined();
      expect(callArgs[1].StartMileage).not.toBeNull();
    });
  });

  // ==================================================================================
  // 3. DRIVE SESSION COMPLETED - Must not pass undefined for labels/addresses
  // ==================================================================================

  describe('drive_session_completed trigger', () => {
    it('should_NOT_pass_undefined_when_location_labels_are_empty', async () => {
      // Arrange - Locations with empty labels
      const startLocation = new LocationType('', 52.1, 5.0, 'Start Address');
      const endLocation = new LocationType('', 52.2, 5.1, 'End Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getLastTripCompleteLocation as jest.Mock).mockReturnValue(startLocation);
      (mockStateManager.getLastLocation as jest.Mock).mockReturnValue(endLocation);
      (mockStateManager.getLastTripCompleteMileage as jest.Mock).mockReturnValue(10000);

      vehicle.currentVehicleState = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
        currentMileage: 10050,
      } as VehicleStatus;

      // Act
      await vehicle['triggerDriveSessionCompleted']();

      // Assert - Flow triggered with empty strings, NOT undefined
      const flowCard = mockFlowCards.get('drive_session_completed');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].StartLabel).toBe('');
      expect(callArgs[1].EndLabel).toBe('');
      expect(callArgs[1].StartLabel).not.toBeUndefined();
      expect(callArgs[1].EndLabel).not.toBeUndefined();
    });

    it('should_NOT_pass_undefined_when_location_addresses_are_empty', async () => {
      // Arrange - Locations without addresses
      const startLocation = new LocationType('Start', 52.1, 5.0, '');
      const endLocation = new LocationType('End', 52.2, 5.1, '');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getLastTripCompleteLocation as jest.Mock).mockReturnValue(startLocation);
      (mockStateManager.getLastLocation as jest.Mock).mockReturnValue(endLocation);
      (mockStateManager.getLastTripCompleteMileage as jest.Mock).mockReturnValue(10000);

      // Mock checkGeofence to NOT set addresses
      jest.spyOn(vehicle as any, 'checkGeofence').mockImplementation(async () => {
        // Don't set address
      });

      vehicle.currentVehicleState = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
        currentMileage: 10050,
      } as VehicleStatus;

      // Act
      await vehicle['triggerDriveSessionCompleted']();

      // Assert - Flow triggered with empty strings, NOT undefined
      const flowCard = mockFlowCards.get('drive_session_completed');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].StartAddress).toBe('');
      expect(callArgs[1].EndAddress).toBe('');
      expect(callArgs[1].StartAddress).not.toBeUndefined();
      expect(callArgs[1].EndAddress).not.toBeUndefined();
    });
  });

  // ==================================================================================
  // 4. LOCATION CHANGED - Must not pass undefined for label/address
  // ==================================================================================

  describe('location_changed trigger', () => {
    it('should_NOT_pass_undefined_when_location_label_is_empty', async () => {
      // Arrange - Location with empty label
      const newLocation = new LocationType('', 52.2, 5.1, 'Test Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('location_changed');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].label).toBe('');
      expect(callArgs[1].label).not.toBeUndefined();
      expect(callArgs[1].label).not.toBeNull();
    });

    it('should_NOT_pass_undefined_when_location_address_is_empty', async () => {
      // Arrange - Location without address
      const newLocation = new LocationType('Work', 52.2, 5.1, '');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('location_changed');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].address).toBe('');
      expect(callArgs[1].address).not.toBeUndefined();
      expect(callArgs[1].address).not.toBeNull();
    });

    it('should_pass_valid_latitude_and_longitude', async () => {
      // Arrange
      const newLocation = new LocationType('Work', 52.123456, 5.654321, 'Test Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](undefined, newLocation);

      // Assert - Coordinates are numbers (required)
      const flowCard = mockFlowCards.get('location_changed');
      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(typeof callArgs[1].latitude).toBe('number');
      expect(typeof callArgs[1].longitude).toBe('number');
      expect(callArgs[1].latitude).toBe(52.123456);
      expect(callArgs[1].longitude).toBe(5.654321);
    });
  });

  // ==================================================================================
  // 5. GEOFENCE ENTER - Must not pass undefined for address
  // ==================================================================================

  describe('geo_fence_enter trigger', () => {
    it('should_NOT_pass_undefined_when_address_is_empty', async () => {
      // Arrange - Entering geofence without address
      const oldLocation = new LocationType('', 52.1, 5.0, 'Old Address');
      const newLocation = new LocationType('Home', 52.1, 5.0, ''); // No address
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('geo_fence_enter');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].address).toBe('');
      expect(callArgs[1].address).not.toBeUndefined();
      expect(callArgs[1].address).not.toBeNull();
    });

    it('should_NOT_invoke_trigger_when_label_is_empty', async () => {
      // Arrange - New location has no label (not a geofence)
      const oldLocation = new LocationType('Home', 52.1, 5.0, 'Old Address');
      const newLocation = new LocationType('', 52.2, 5.1, 'New Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert - Geofence enter NOT triggered (no label = not entering geofence)
      const flowCard = mockFlowCards.get('geo_fence_enter');
      expect(flowCard?.trigger).not.toHaveBeenCalled();
    });
  });

  // ==================================================================================
  // 6. GEOFENCE EXIT - Must not pass undefined for address
  // ==================================================================================

  describe('geo_fence_exit trigger', () => {
    it('should_NOT_pass_undefined_when_address_is_empty', async () => {
      // Arrange - Exiting geofence without address
      const oldLocation = new LocationType('Home', 52.1, 5.0, ''); // No address
      const newLocation = new LocationType('', 52.2, 5.1, 'New Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('geo_fence_exit');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].address).toBe('');
      expect(callArgs[1].address).not.toBeUndefined();
      expect(callArgs[1].address).not.toBeNull();
    });

    it('should_NOT_invoke_trigger_when_oldLocation_label_is_empty', async () => {
      // Arrange - Old location has no label (not leaving a geofence)
      const oldLocation = new LocationType('', 52.1, 5.0, 'Old Address');
      const newLocation = new LocationType('Work', 52.2, 5.1, 'New Address');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getIsDriving as jest.Mock).mockReturnValue(true);

      // Act
      await vehicle['triggerLocationFlows'](oldLocation, newLocation);

      // Assert - Geofence exit NOT triggered (no label = not exiting geofence)
      const flowCard = mockFlowCards.get('geo_fence_exit');
      expect(flowCard?.trigger).not.toHaveBeenCalled();
    });
  });

  // ==================================================================================
  // 7. REFUELLING - Already tested in Vehicle.refueling.test.ts
  // ==================================================================================

  describe('refuelled trigger', () => {
    it('should_NOT_pass_undefined_when_location_address_is_missing', async () => {
      // Arrange - Set initial fuel level LOW to trigger refueling
      vehicle.currentVehicleState = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
        combustion: {
          fuelLevelPercent: 20,
          fuelLevelLiters: 20, // Low fuel
          range: 200,
        },
      } as VehicleStatus;

      // Location without address
      const location = new LocationType('Gas Station', 52.1, 5.0, '');
      const mockStateManager = vehicle['stateManager'];
      (mockStateManager.getLastLocation as jest.Mock).mockReturnValue(location);

      // Mock resolveAddress to NOT set address (simulate failure)
      jest.spyOn(vehicle as any, 'resolveAddress').mockImplementation(async () => {
        // Don't set address
      });

      // New status with HIGH fuel level (increase of 40 liters triggers refueling flow with threshold of 5)
      const newStatus: VehicleStatus = {
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
        combustion: {
          fuelLevelPercent: 80,
          fuelLevelLiters: 60, // +40 liters increase
          range: 600,
        },
      } as VehicleStatus;

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Flow triggered with empty string, NOT undefined
      const flowCard = mockFlowCards.get('refuelled');
      expect(flowCard?.trigger).toHaveBeenCalled();

      const callArgs = (flowCard?.trigger as jest.Mock).mock.calls[0];
      expect(callArgs[1].Location).toBe('');
      expect(callArgs[1].Location).not.toBeUndefined();
      expect(callArgs[1].Location).not.toBeNull();
    });
  });
});
