/**
 * Vehicle Charging Status Change Flow Tests
 *
 * Tests for the charging status change detection and flow trigger logic.
 * Validates that the charging_status_change flow card is triggered when
 * the charging status changes or on first status update.
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

describe('Vehicle Charging Status Change Flow', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockChargingStatusChangeFlowCard: any;
  let setCapabilityValueSafeSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create vehicle instance using helper
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;

    // Mock charging status change flow card
    mockChargingStatusChangeFlowCard = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };

    // Set up vehicle.homey with flow card mock
    const mockHomey = {
      app: mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardId: string) => {
          if (cardId === 'charging_status_change') {
            return mockChargingStatusChangeFlowCard;
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
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
      }),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      getDriveTrain: jest.fn().mockReturnValue(DriveTrainType.ELECTRIC),
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

  describe('Charging Status Change Detection', () => {
    it('should_triggerChargingStatusChangeFlow_when_statusChanges', async () => {
      // Arrange - Set initial state with NOT_CHARGING status
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 50,
          range: 200,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // New status - changed to CHARGING
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:05:00Z'),
        electric: {
          chargeLevelPercent: 52,
          range: 208,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify charging status change flow was triggered
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          charging_status: 'CHARGING',
        },
        {}
      );

      // Verify EV charging state capability was updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in_charging' // Converted value
      );
    });

    it('should_notTriggerChargingStatusChangeFlow_when_statusUnchanged', async () => {
      // Arrange - Set initial state with CHARGING status
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 50,
          range: 200,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      } as VehicleStatus;

      // New status - same CHARGING status, just higher battery level
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:05:00Z'),
        electric: {
          chargeLevelPercent: 55,
          range: 220,
          isChargerConnected: true,
          chargingStatus: 'CHARGING', // Same status
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify charging status change flow was NOT triggered
      expect(mockChargingStatusChangeFlowCard.trigger).not.toHaveBeenCalled();

      // Verify EV charging state capability was still updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in_charging'
      );
    });

    it('should_triggerChargingStatusChangeFlow_when_noPreviousStatus', async () => {
      // Arrange - No previous vehicle state (first update after pairing/initialization)
      vehicle.currentVehicleState = null;

      // New status - first status update
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 75,
          range: 300,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify charging status change flow was triggered (first status notification)
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          charging_status: 'CHARGING',
        },
        {}
      );

      // Verify EV charging state capability was updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in_charging'
      );
    });

    it('should_updateEVChargingStateCapability_when_statusChanges', async () => {
      // Arrange
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 80,
          range: 320,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      } as VehicleStatus;

      // New status - charging completed
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T11:00:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: true,
          chargingStatus: 'COMPLETE',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Verify both flow and capability were updated
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in' // COMPLETE converts to plugged_in
      );
    });
  });

  describe('Different Status Transitions', () => {
    it('should_triggerFlow_when_changingFrom_NOTCHARGING_to_CHARGING', async () => {
      // Arrange - Vehicle not charging
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T08:00:00Z'),
        electric: {
          chargeLevelPercent: 30,
          range: 120,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // New status - plugged in and charging
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T08:05:00Z'),
        electric: {
          chargeLevelPercent: 31,
          range: 124,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'CHARGING' },
        {}
      );
    });

    it('should_triggerFlow_when_changingFrom_CHARGING_to_COMPLETE', async () => {
      // Arrange - Vehicle actively charging
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T09:00:00Z'),
        electric: {
          chargeLevelPercent: 95,
          range: 380,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      } as VehicleStatus;

      // New status - charging complete
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T09:30:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: true,
          chargingStatus: 'COMPLETE',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'COMPLETE' },
        {}
      );
    });

    it('should_triggerFlow_when_changingFrom_COMPLETE_to_NOTCHARGING', async () => {
      // Arrange - Charging complete, still plugged in
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: true,
          chargingStatus: 'COMPLETE',
        },
      } as VehicleStatus;

      // New status - unplugged
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:05:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'NOT_CHARGING' },
        {}
      );
    });

    it('should_triggerFlow_when_changingFrom_CHARGING_to_NOTCHARGING', async () => {
      // Arrange - Vehicle actively charging
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T11:00:00Z'),
        electric: {
          chargeLevelPercent: 60,
          range: 240,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      } as VehicleStatus;

      // New status - unplugged while charging (interrupted)
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T11:05:00Z'),
        electric: {
          chargeLevelPercent: 61,
          range: 244,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'NOT_CHARGING' },
        {}
      );
    });
  });

  describe('Edge Cases', () => {
    it('should_notTriggerFlow_when_electricDataMissing', async () => {
      // Arrange - Previous state with electric data
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 70,
          range: 280,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // New status - no electric data (incomplete API response)
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:05:00Z'),
        // No electric property
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - No flow trigger when electric data missing
      expect(mockChargingStatusChangeFlowCard.trigger).not.toHaveBeenCalled();
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        expect.anything()
      );
    });

    it('should_notTriggerFlow_when_chargingStatusMissing', async () => {
      // Arrange
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 70,
          range: 280,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // New status - electric data present but no chargingStatus field
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:05:00Z'),
        electric: {
          chargeLevelPercent: 72,
          range: 288,
          isChargerConnected: false,
          chargingStatus: undefined as any, // Missing/undefined
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - No flow trigger when chargingStatus missing
      expect(mockChargingStatusChangeFlowCard.trigger).not.toHaveBeenCalled();
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        expect.anything()
      );
    });

    it('should_handleMultipleStatusChanges_consecutively', async () => {
      // Arrange - Start with NOT_CHARGING
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T08:00:00Z'),
        electric: {
          chargeLevelPercent: 40,
          range: 160,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // Act 1 - Change to CHARGING
      const status1: VehicleStatus = {
        ...vehicle.currentVehicleState,
        lastUpdatedAt: new Date('2025-11-05T08:05:00Z'),
        electric: {
          chargeLevelPercent: 41,
          range: 164,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      };
      await (vehicle as any).updateCapabilitiesFromStatus(status1);

      // Assert 1
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(1);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenLastCalledWith(
        vehicle,
        { charging_status: 'CHARGING' },
        {}
      );

      // Act 2 - Change to COMPLETE
      const status2: VehicleStatus = {
        ...status1,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: true,
          chargingStatus: 'COMPLETE',
        },
      };
      await (vehicle as any).updateCapabilitiesFromStatus(status2);

      // Assert 2
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(2);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenLastCalledWith(
        vehicle,
        { charging_status: 'COMPLETE' },
        {}
      );

      // Act 3 - Change to NOT_CHARGING (unplugged)
      const status3: VehicleStatus = {
        ...status2,
        lastUpdatedAt: new Date('2025-11-05T10:05:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      };
      await (vehicle as any).updateCapabilitiesFromStatus(status3);

      // Assert 3
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledTimes(3);
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenLastCalledWith(
        vehicle,
        { charging_status: 'NOT_CHARGING' },
        {}
      );
    });
  });

  describe('Integration with Capability Updates', () => {
    it('should_updateBothCapabilityAndTriggerFlow_when_statusChanges', async () => {
      // Arrange
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T09:00:00Z'),
        electric: {
          chargeLevelPercent: 50,
          range: 200,
          isChargerConnected: false,
          chargingStatus: 'NOT_CHARGING',
        },
      } as VehicleStatus;

      // New status - plugged in
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T09:05:00Z'),
        electric: {
          chargeLevelPercent: 51,
          range: 204,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Both capability and flow should be updated
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in_charging'
      );
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'CHARGING' },
        {}
      );
    });

    it('should_passRawChargingStatus_toFlowToken', async () => {
      // Arrange - Test that flow receives raw BMW status, not converted Homey state
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:00:00Z'),
        electric: {
          chargeLevelPercent: 99,
          range: 396,
          isChargerConnected: true,
          chargingStatus: 'CHARGING',
        },
      } as VehicleStatus;

      // New status - charging complete
      const newStatus: VehicleStatus = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2025-11-05T10:30:00Z'),
        electric: {
          chargeLevelPercent: 100,
          range: 400,
          isChargerConnected: true,
          chargingStatus: 'COMPLETE', // Raw BMW status
        },
      };

      // Act
      await (vehicle as any).updateCapabilitiesFromStatus(newStatus);

      // Assert - Flow should receive raw 'COMPLETE', not 'plugged_in'
      expect(mockChargingStatusChangeFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'COMPLETE' }, // Raw BMW status
        {}
      );

      // But capability should receive converted Homey state
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in' // Converted Homey state
      );
    });
  });
});
