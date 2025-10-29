/**
 * Vehicle Capability Migration Tests
 *
 * Tests for drivetrain-based capability migration logic.
 * These tests validate that the correct capabilities are added/removed
 * based on vehicle drivetrain type (electric, combustion, hybrid).
 */

// Mock semver
jest.mock('semver', () => ({
  gte: jest.fn().mockReturnValue(true),
}));

// Mock geolocation-utils
jest.mock('geolocation-utils');

import { Vehicle } from '../../drivers/Vehicle';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { Capabilities } from '../../utils/Capabilities';

describe('Vehicle Capability Migration Tests', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockLogger: any;
  let addCapabilitySafeSpy: jest.SpyInstance;
  let removeCapabilitySafeSpy: jest.SpyInstance;

  // Helper: Create mock VehicleStatus
  const createMockVehicleStatus = (driveTrain: DriveTrainType): VehicleStatus => ({
    vin: 'TEST123456789',
    driveTrain,
    lastUpdatedAt: new Date('2025-10-29T10:00:00Z'),
  });

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
    vehicle.getName = jest.fn().mockReturnValue('Test BMW');
    vehicle.getData = jest.fn().mockReturnValue({ id: 'TEST123' });
    vehicle.getClass = jest.fn().mockReturnValue('other');
    vehicle.setClass = jest.fn().mockResolvedValue(undefined);
    vehicle.getEnergy = jest.fn().mockReturnValue({});
    vehicle.setEnergy = jest.fn().mockResolvedValue(undefined);

    // Spy on capability methods
    addCapabilitySafeSpy = jest
      .spyOn(vehicle as any, 'addCapabilitySafe')
      .mockResolvedValue(undefined);

    removeCapabilitySafeSpy = jest
      .spyOn(vehicle as any, 'removeCapabilitySafe')
      .mockResolvedValue(undefined);

    // Mock state manager with helper to avoid repetitive type assertions
    const mockStateManager = {
      getVehicleStatus: jest.fn(),
    };
    vehicle['_stateManager'] = mockStateManager as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Electric Vehicle Capabilities', () => {
    it('should_addElectricCapabilities_when_electricDrivetrain', async () => {
      // Arrange
      const electricStatus = createMockVehicleStatus(DriveTrainType.ELECTRIC);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(electricStatus);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.RANGE_BATTERY);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.EV_CHARGING_STATE);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.RANGE);
    });

    it('should_removeElectricCapabilities_when_combustionDrivetrain', async () => {
      // Arrange
      const combustionStatus = createMockVehicleStatus(DriveTrainType.COMBUSTION);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(combustionStatus);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.RANGE_BATTERY);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.EV_CHARGING_STATE);
    });
  });

  describe('Combustion Vehicle Capabilities', () => {
    it('should_addFuelCapability_when_combustionDrivetrain', async () => {
      // Arrange
      const combustionStatus = createMockVehicleStatus(DriveTrainType.COMBUSTION);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(combustionStatus);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.RANGE);
    });

    it('should_removeFuelCapability_when_electricDrivetrain', async () => {
      // Arrange
      const electricStatus = createMockVehicleStatus(DriveTrainType.ELECTRIC);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(electricStatus);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL);
    });
  });

  describe('Hybrid Vehicle Capabilities', () => {
    it('should_addBothElectricAndFuelCapabilities_when_hybridDrivetrain', async () => {
      // Arrange
      const hybridStatus = createMockVehicleStatus(DriveTrainType.PLUGIN_HYBRID);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(hybridStatus);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      // Electric capabilities
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.RANGE_BATTERY);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.EV_CHARGING_STATE);
      // Fuel capabilities
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.REMAINING_FUEL);
      // Range (both)
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.RANGE);
    });
  });

  describe('Remote Service Capabilities Removal', () => {
    it('should_removeAllRemoteServiceCapabilities_when_migrating', async () => {
      // Arrange
      const status = createMockVehicleStatus(DriveTrainType.ELECTRIC);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(status);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert - Verify all remote service capabilities are removed
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.LOCKED);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CLIMATE_NOW);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.START_CHARGING);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.STOP_CHARGING);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.AC_CHARGING_LIMIT);
      expect(removeCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CHARGING_TARGET_SOC);
    });
  });

  describe('Missing Status Handling', () => {
    it('should_skipMigration_when_statusUnavailable', async () => {
      // Arrange
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(null);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Vehicle status not available')
      );
      // No capability changes should be made (beyond removing remote service capabilities)
    });
  });

  describe('Device Class Migration', () => {
    it('should_migrateToCarClass_when_homeyVersion12Plus', async () => {
      // Arrange
      const status = createMockVehicleStatus(DriveTrainType.ELECTRIC);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(status);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(vehicle.setClass).toHaveBeenCalledWith('car');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Migrating device class')
      );
    });
  });

  describe('Energy Capabilities for Electric Vehicles', () => {
    it('should_setEnergyCapabilities_when_electricVehicle', async () => {
      // Arrange
      const electricStatus = createMockVehicleStatus(DriveTrainType.ELECTRIC);
      const mockStateManager = vehicle['_stateManager'] as any;
      mockStateManager.getVehicleStatus.mockReturnValue(electricStatus);

      // Act
      await vehicle['migrate_device_capabilities']();

      // Assert
      expect(vehicle.setEnergy).toHaveBeenCalledWith({
        batteries: ['INTERNAL'],
        electricCar: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Setting energy capabilities')
      );
    });
  });
});
