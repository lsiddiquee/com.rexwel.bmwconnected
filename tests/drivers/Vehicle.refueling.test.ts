/**
 * Vehicle Refueling Flow Tests
 *
 * Tests for the refueling detection and flow trigger logic.
 * Validates that the refuelled flow card is triggered when fuel level
 * increases beyond the configured threshold.
 */

// Mock geolocation-utils
jest.mock('geolocation-utils', () => ({
  distanceTo: jest.fn().mockReturnValue(150),
}));

// Mock semver
jest.mock('semver');

import { Vehicle } from '../../drivers/Vehicle';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import { Capabilities } from '../../utils/Capabilities';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

describe('Vehicle Refueling Flow', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockRefuelledFlowCard: any;
  let setCapabilityValueSafeSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create vehicle instance using helper
    const result = createMockedVehicle({
      refuellingTriggerThreshold: 5, // 5 liter threshold
    });
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;

    // Mock refuelled flow card
    mockRefuelledFlowCard = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };

    // Set up vehicle.homey with flow card mock
    const mockHomey = {
      app: mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardId: string) => {
          if (cardId === 'refuelled') {
            return mockRefuelledFlowCard;
          }
          return { trigger: jest.fn() };
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
      getIsDriving: jest.fn().mockReturnValue(false),
      getVehicleStatus: jest.fn().mockReturnValue({
        vin: 'TEST_VIN',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date(),
      }),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      getDriveTrain: jest.fn().mockReturnValue(DriveTrainType.COMBUSTION),
    } as any;
    vehicle['stateManager'] = mockStateManager;

    // Mock setCapabilityValueSafe
    setCapabilityValueSafeSpy = jest
      .spyOn(vehicle as any, 'setCapabilityValueSafe')
      .mockResolvedValue(true);

    // Mock other methods to prevent side effects
    jest.spyOn(vehicle as any, 'shouldTriggerLocationFlows').mockReturnValue(false);
    jest.spyOn(vehicle as any, 'triggerLocationFlows').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Refueling Detection', () => {
    it('should_triggerRefuelledFlow_when_fuelIncreasesAboveThreshold', async () => {
      // Arrange - Set initial state with low fuel
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        location: {
          coordinates: { latitude: 52.52, longitude: 13.405 },
          address: { formatted: 'Berlin, Germany' },
        },
        combustion: {
          fuelLevelLiters: 10, // Low fuel
          fuelLevelPercent: 15,
        },
        range: 100,
      } as VehicleStatus;

      // Mock stateManager to return location with address
      const mockStateManager = vehicle['stateManager'] as any;
      mockStateManager.getLastLocation = jest.fn().mockReturnValue({
        label: '',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Berlin, Germany',
      });

      // New status after refueling - fuel increased by 30 liters (>5 threshold)
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:05:00Z'),
        location: {
          coordinates: { latitude: 52.52, longitude: 13.405 },
          address: { formatted: 'Berlin, Germany' },
        },
        combustion: {
          fuelLevelLiters: 40, // Refueled to 40 liters
          fuelLevelPercent: 60,
        },
        range: 400,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was triggered
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          FuelBeforeRefuelling: 10,
          FuelAfterRefuelling: 40,
          RefuelledLiters: 30,
          Location: 'Berlin, Germany',
        },
        {}
      );

      // Verify fuel capability was updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.REMAINING_FUEL,
        40 // Raw value (UnitConverter called internally)
      );
    });

    it('should_notTriggerRefuelledFlow_when_fuelIncreasesBelowThreshold', async () => {
      // Arrange - Set initial state
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 35,
          fuelLevelPercent: 50,
        },
        range: 350,
      } as VehicleStatus;

      // New status - fuel increased by only 3 liters (<5 threshold)
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:01:00Z'),
        combustion: {
          fuelLevelLiters: 38, // Small increase (3 liters)
          fuelLevelPercent: 54,
        },
        range: 380,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was NOT triggered
      expect(mockRefuelledFlowCard.trigger).not.toHaveBeenCalled();

      // Verify fuel capability was still updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL, 38);
    });

    it('should_notTriggerRefuelledFlow_when_fuelDecreases', async () => {
      // Arrange - Set initial state with full tank
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 50,
          fuelLevelPercent: 75,
        },
        range: 500,
      } as VehicleStatus;

      // New status - fuel decreased (driving)
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T11:00:00Z'),
        combustion: {
          fuelLevelLiters: 40, // Decreased by 10 liters
          fuelLevelPercent: 60,
        },
        range: 400,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was NOT triggered
      expect(mockRefuelledFlowCard.trigger).not.toHaveBeenCalled();
    });

    it('should_triggerRefuelledFlow_when_refueledFromEmptyTank', async () => {
      // Arrange — oldFuelValue is 0 (completely empty); `oldFuelValue &&` would be
      // falsy and suppress the trigger, but `oldFuelValue !== undefined` correctly fires it
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 0, // completely empty
          fuelLevelPercent: 0,
        },
        range: 0,
      } as VehicleStatus;

      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:10:00Z'),
        combustion: {
          fuelLevelLiters: 40, // refueled 40 liters (>5 threshold)
          fuelLevelPercent: 60,
        },
        range: 400,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert — flow must fire even though oldFuelValue was 0
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          FuelBeforeRefuelling: 0,
          FuelAfterRefuelling: 40,
          RefuelledLiters: 40,
          Location: '',
        },
        {}
      );
    });

    it('should_notTriggerRefuelledFlow_when_noPreviousFuelValue', async () => {
      // Arrange - No previous state (first update after pairing)
      vehicle.currentVehicleState = null;

      // New status with fuel value
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 45,
          fuelLevelPercent: 65,
        },
        range: 450,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was NOT triggered (no baseline)
      expect(mockRefuelledFlowCard.trigger).not.toHaveBeenCalled();

      // Verify fuel capability was updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL, 45);
    });

    it('should_includeLocationInToken_when_locationAvailable', async () => {
      // Arrange - Set initial state with location
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        location: {
          coordinates: { latitude: 52.37, longitude: 4.9 },
          address: { formatted: 'Amsterdam, Netherlands' },
        },
        combustion: {
          fuelLevelLiters: 15,
          fuelLevelPercent: 22,
        },
        range: 150,
      } as VehicleStatus;

      // Mock stateManager to return location with address
      const mockStateManager = vehicle['stateManager'] as any;
      mockStateManager.getLastLocation = jest.fn().mockReturnValue({
        label: '',
        latitude: 52.37,
        longitude: 4.9,
        address: 'Amsterdam, Netherlands',
      });

      // New status after refueling at gas station
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:10:00Z'),
        location: {
          coordinates: { latitude: 52.37, longitude: 4.9 },
          address: { formatted: 'Shell Gas Station, Amsterdam' },
        },
        combustion: {
          fuelLevelLiters: 50, // Refueled by 35 liters
          fuelLevelPercent: 75,
        },
        range: 500,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify location was included in flow card tokens
      // Note: Location comes from stateManager.getLastLocation() (persisted location)
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          FuelBeforeRefuelling: 15,
          FuelAfterRefuelling: 50,
          RefuelledLiters: 35,
          Location: 'Amsterdam, Netherlands', // From stateManager.getLastLocation()
        },
        {}
      );
    });

    it('should_handleUndefinedLocation_when_refueling', async () => {
      // Arrange - Set initial state without location
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 20,
          fuelLevelPercent: 30,
        },
        range: 200,
      } as VehicleStatus;

      // New status - refueled but no location data
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:10:00Z'),
        combustion: {
          fuelLevelLiters: 55, // Refueled by 35 liters
          fuelLevelPercent: 82,
        },
        range: 550,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was triggered with empty string location
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          FuelBeforeRefuelling: 20,
          FuelAfterRefuelling: 55,
          RefuelledLiters: 35,
          Location: '', // Empty string instead of undefined
        },
        {}
      );
    });

    it('should_respectCustomThreshold_when_configured', async () => {
      // Arrange - Create vehicle with custom 10 liter threshold
      const customResult = createMockedVehicle({
        refuellingTriggerThreshold: 10, // 10 liter threshold
      });
      const customVehicle = customResult.vehicle;

      // Setup mocks for custom vehicle
      customVehicle['stateManager'] = vehicle['stateManager'];
      jest.spyOn(customVehicle as any, 'setCapabilityValueSafe').mockResolvedValue(true);
      jest.spyOn(customVehicle as any, 'shouldTriggerLocationFlows').mockReturnValue(false);

      customVehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 25,
          fuelLevelPercent: 37,
        },
        range: 250,
      } as VehicleStatus;

      // New status - fuel increased by 8 liters (below 10 liter threshold)
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:10:00Z'),
        combustion: {
          fuelLevelLiters: 33, // Increased by 8 liters
          fuelLevelPercent: 49,
        },
        range: 330,
      };

      // Act
      await (customVehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was NOT triggered (below 10L threshold)
      expect(mockRefuelledFlowCard.trigger).not.toHaveBeenCalled();
    });

    it('should_handleZeroFuelIncrease_gracefully', async () => {
      // Arrange - Set initial state
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 30,
          fuelLevelPercent: 45,
        },
        range: 300,
      } as VehicleStatus;

      // New status - no fuel change
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:01:00Z'),
        combustion: {
          fuelLevelLiters: 30, // No change
          fuelLevelPercent: 45,
        },
        range: 300,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow was NOT triggered
      expect(mockRefuelledFlowCard.trigger).not.toHaveBeenCalled();
    });

    it('should_handleExactThresholdMatch_asTrigger', async () => {
      // Arrange - Set initial state
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 30,
          fuelLevelPercent: 45,
        },
        range: 300,
      } as VehicleStatus;

      // New status - fuel increased by exactly 5 liters (threshold)
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:10:00Z'),
        combustion: {
          fuelLevelLiters: 35, // Exactly 5 liter increase
          fuelLevelPercent: 52,
        },
        range: 350,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify refuelled flow WAS triggered (>= threshold)
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          FuelBeforeRefuelling: 30,
          FuelAfterRefuelling: 35,
          RefuelledLiters: 5,
          Location: '', // Empty string when no location available
        },
        {}
      );
    });

    it('should_resolveAddressViaOpenStreetMap_when_locationHasNoAddress', async () => {
      // Arrange - Set initial state with low fuel
      vehicle.currentVehicleState = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:00:00Z'),
        combustion: {
          fuelLevelLiters: 10,
          fuelLevelPercent: 15,
        },
        range: 100,
      } as VehicleStatus;

      // Mock stateManager to return location WITHOUT address
      const mockStateManager = vehicle['stateManager'] as any;
      const locationWithoutAddress = {
        label: '',
        latitude: 48.1351,
        longitude: 11.582,
        address: '', // No address - should trigger OpenStreetMap call
      };
      mockStateManager.getLastLocation = jest.fn().mockReturnValue(locationWithoutAddress);

      // Mock resolveAddress to simulate OpenStreetMap resolution
      const resolveAddressSpy = jest
        .spyOn(vehicle as any, 'resolveAddress')
        .mockImplementation(async (location: any) => {
          // Simulate what OpenStreetMap.GetAddress would do - update location in place
          location.address = '123 Main St, Munich, Germany';
        });

      // New status after refueling - fuel increased by 30 liters (>5 threshold)
      const newStatus: VehicleStatus = {
        vin: 'WBA12345678901234',
        driveTrain: DriveTrainType.COMBUSTION,
        lastUpdatedAt: new Date('2025-11-04T10:05:00Z'),
        combustion: {
          fuelLevelLiters: 40, // Refueled to 40 liters
          fuelLevelPercent: 60,
        },
        range: 400,
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify resolveAddress was called to fetch missing address
      expect(resolveAddressSpy).toHaveBeenCalledTimes(1);
      expect(resolveAddressSpy).toHaveBeenCalledWith(locationWithoutAddress);

      // Verify setLastLocation was called to persist the resolved address
      expect(mockStateManager.setLastLocation).toHaveBeenCalledWith(locationWithoutAddress);

      // Verify the location object was updated with resolved address
      expect(locationWithoutAddress.address).toBe('123 Main St, Munich, Germany');

      // Verify refuelled flow was triggered with the resolved address
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockRefuelledFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          FuelBeforeRefuelling: 10,
          FuelAfterRefuelling: 40,
          RefuelledLiters: 30,
          Location: '123 Main St, Munich, Germany', // Resolved address from OpenStreetMap
        },
        {}
      );
    });
  });
});
