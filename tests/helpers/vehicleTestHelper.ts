/**
 * Test helper utilities for Vehicle test setup
 *
 * Provides consistent mocking patterns that work with Vehicle's getter-based properties
 */

import { Vehicle } from '../../drivers/Vehicle';
import { DeviceSettings } from '../../utils/DeviceSettings';

export interface VehicleTestMocks {
  mockApp: any;
  mockLogger: any;
  mockSettings: any;
  mockDeviceData: any;
}

/**
 * Create a properly mocked Vehicle instance for testing
 *
 * Instead of directly assigning to getters (which doesn't work), this mocks
 * the underlying Homey Device methods that the getters call.
 *
 * @param customSettings - Optional custom settings to merge with defaults
 * @param customDeviceData - Optional custom device data
 * @returns Vehicle instance with mocks
 */
export function createMockedVehicle(
  customSettings: Partial<DeviceSettings> = {},
  customDeviceData: { id: string } = { id: 'TEST_VIN_123' }
): { vehicle: Vehicle; mocks: VehicleTestMocks } {
  // Create mock app and logger
  const mockApp = {
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    getAuthProvider: jest.fn(),
    getApiClient: jest.fn(),
    createHttpClient: jest.fn(),
  };

  const mockLogger = mockApp.logger;

  // Mock settings with defaults
  const mockSettings = {
    distanceUnit: 'metric',
    fuelUnit: 'liter',
    apiPollingEnabled: true,
    apiPollingInterval: 60,
    streamingEnabled: true,
    locationUpdateThreshold: 50,
    ...customSettings,
  };

  const mockDeviceData = customDeviceData;

  // Create vehicle instance using Object.create to bypass constructor
  const vehicle = Object.create(Vehicle.prototype);

  // Mock homey object (must be set before getters are accessed)
  vehicle.homey = {
    app: mockApp,
    version: '12.5.0',
    flow: {
      getDeviceTriggerCard: jest.fn().mockReturnValue({
        trigger: jest.fn().mockResolvedValue(undefined),
      }),
    },
  } as any;

  // Mock underlying Homey Device methods that getters use
  // Use mockImplementation to ensure each call gets latest values
  vehicle.getData = jest.fn().mockImplementation(() => mockDeviceData);
  vehicle.getSettings = jest.fn().mockImplementation(() => ({ ...mockSettings }));
  vehicle.setSettings = jest.fn().mockImplementation((newSettings: any) => {
    Object.assign(mockSettings, newSettings);
    return Promise.resolve();
  });

  // Mock other common Device methods
  vehicle.getName = jest.fn().mockReturnValue('Test BMW i4');
  vehicle.hasCapability = jest.fn().mockReturnValue(false);
  vehicle.addCapability = jest.fn().mockResolvedValue(undefined);
  vehicle.removeCapability = jest.fn().mockResolvedValue(undefined);
  vehicle.getCapabilityValue = jest.fn().mockResolvedValue(100);
  vehicle.setCapabilityValue = jest.fn().mockResolvedValue(undefined);
  vehicle.setCapabilityOptions = jest.fn().mockResolvedValue(undefined);
  vehicle.setClass = jest.fn().mockResolvedValue(undefined);
  vehicle.getClass = jest.fn().mockReturnValue('other');
  vehicle.setEnergy = jest.fn().mockResolvedValue(undefined);
  vehicle.getEnergy = jest.fn().mockReturnValue({});

  return {
    vehicle,
    mocks: {
      mockApp,
      mockLogger,
      mockSettings,
      mockDeviceData,
    },
  };
}

/**
 * Update mock settings and ensure getSettings returns the updated values
 *
 * @param vehicle - Mocked vehicle instance
 * @param newSettings - New settings values
 */
export function updateMockSettings(vehicle: Vehicle, newSettings: Partial<DeviceSettings>): void {
  const currentSettings = (vehicle.getSettings as jest.Mock).mock.results[0]?.value || {};
  Object.assign(currentSettings, newSettings);
}

/**
 * Update mock device data
 *
 * @param vehicle - Mocked vehicle instance
 * @param newDeviceData - New device data
 */
export function updateMockDeviceData(vehicle: Vehicle, newDeviceData: { id: string }): void {
  (vehicle.getData as jest.Mock).mockReturnValue(newDeviceData);
}
