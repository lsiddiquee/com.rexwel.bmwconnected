/**
 * Tests for Vehicle Trip Completion Detection
 *
 * Tests the MQTT-based trip completion detection system that:
 * - Detects TRIP category telematic messages
 * - Uses 1-second trailing-edge debounce
 * - Resets timer on ANY MQTT message
 * - Triggers drive_session_completed flow after silence
 * - Persists trip start location/mileage for accurate trip data
 */

import { Vehicle } from '../../drivers/Vehicle';
import { StreamMessage } from '../../lib/streaming/StreamMessage';
import { DeviceStateManager } from '../../utils/DeviceStateManager';
import { ILogger } from '../../lib/types/ILogger';
import { VehicleStatus } from '../../lib/models/VehicleStatus';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { TelematicCategory, getKeysByCategory } from '../../lib/types/TelematicKeys';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

// Mock TelematicKeys module
jest.mock('../../lib/types/TelematicKeys', () => ({
  TelematicCategory: {
    TRIP: 'TRIP',
    DRIVETRAIN: 'DRIVETRAIN',
    CABIN: 'CABIN',
  },
  getKeysByCategory: jest.fn(),
}));

/**
 * Helper to create StreamMessage with all required fields
 */
function createStreamMessage(dataOverride: Record<string, any>): StreamMessage {
  return {
    vin: 'TEST_VIN_123',
    entityId: 'entity-123',
    topic: 'TEST_VIN_123',
    timestamp: '2025-01-15T10:00:00Z',
    data: dataOverride,
  };
}

describe('Vehicle Trip Completion Detection', () => {
  let vehicle: Vehicle;
  let mockApp: any;
  let mockHomey: any;
  let mockLogger: ILogger;
  let mockStateManager: jest.Mocked<DeviceStateManager>;
  let mockFlowCard: any;
  let mockSettings: any;

  beforeEach(() => {
    jest.useFakeTimers();

    // Clear cached TRIP keys between tests
    (Vehicle as any)._tripCategoryKeys = undefined;

    // Mock TRIP category keys
    (getKeysByCategory as jest.Mock).mockReturnValue([
      { key: 'trip.distance', category: TelematicCategory.TRIP },
      { key: 'trip.duration', category: TelematicCategory.TRIP },
      { key: 'trip.averageSpeed', category: TelematicCategory.TRIP },
    ]);

    // Create vehicle instance using helper
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockApp = result.mocks.mockApp;
    mockLogger = result.mocks.mockLogger as ILogger;
    mockSettings = result.mocks.mockSettings;

    // Create mock flow card
    mockFlowCard = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock Homey
    mockHomey = {
      app: mockApp,
      settings: {
        get: jest.fn().mockReturnValue({ geofences: [] }),
      },
      flow: {
        getDeviceTriggerCard: jest.fn().mockReturnValue(mockFlowCard),
      },
    };

    // Create mock state manager
    const mockVehicleStatus: VehicleStatus = {
      vin: 'TEST_VIN_123',
      driveTrain: DriveTrainType.PLUGIN_HYBRID,
      lastUpdatedAt: new Date('2025-01-15T10:00:00Z'),
      currentMileage: 15000,
      location: {
        coordinates: { latitude: 52.52, longitude: 13.405 },
        address: { formatted: 'Test Address, Berlin' },
      },
    };

    mockStateManager = {
      getVehicleStatus: jest.fn().mockReturnValue(mockVehicleStatus),
      getLastTripCompleteLocation: jest.fn().mockReturnValue({
        label: 'Home',
        latitude: 52.5,
        longitude: 13.4,
        address: 'Start Address',
      }),
      getLastTripCompleteMileage: jest.fn().mockReturnValue(14950),
      setLastTripCompleteLocation: jest.fn().mockResolvedValue(undefined),
      setLastTripCompleteMileage: jest.fn().mockResolvedValue(undefined),
      updateFromMqttMessage: jest.fn(),
      getLastLocation: jest.fn().mockReturnValue({
        label: '',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Test Address, Berlin',
      }),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-id'),
      getDriveTrain: jest.fn().mockReturnValue(DriveTrainType.PLUGIN_HYBRID),
    } as any;

    // Configure mock app
    mockApp.currentLocation = { latitude: 52.52, longitude: 13.405, label: '', address: '' };

    vehicle.homey = mockHomey;
    mockSettings.distanceUnit = 'metric';
    vehicle['stateManager'] = mockStateManager;
    vehicle['_tripDebounceTimer'] = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('TRIP Category Recognition', () => {
    it('should_startTimer_when_firstTripMessageReceived', async () => {
      // Arrange
      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);

      // Assert
      expect(vehicle['_tripDebounceTimer']).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'First TRIP message received - starting debounce timer'
      );
    });

    it('should_extendTimer_when_subsequentTripMessageReceived', async () => {
      // Arrange - Start timer with first message
      const firstMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });
      await vehicle['checkAndDebounceTripCompletion'](firstMessage);
      const firstTimer = vehicle['_tripDebounceTimer'];

      // Act - Send second TRIP message
      const secondMessage = createStreamMessage({
        'trip.duration': { value: 300, unit: 's', timestamp: '2025-01-15T10:00:10Z' },
      });
      await vehicle['checkAndDebounceTripCompletion'](secondMessage);

      // Assert - Timer should be different (cleared and restarted)
      expect(vehicle['_tripDebounceTimer']).toBeDefined();
      expect(vehicle['_tripDebounceTimer']).not.toBe(firstTimer);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Trip message received - extending debounce timer'
      );
    });

    it('should_notStartTimer_when_nonTripMessageReceivedAndNoActiveTimer', async () => {
      // Arrange
      const nonTripMessage = createStreamMessage({
        'vehicleStatus.mileage': { value: 15000, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](nonTripMessage);

      // Assert
      expect(vehicle['_tripDebounceTimer']).toBeUndefined();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should_extendTimer_when_nonTripMessageReceivedAndTimerActive', async () => {
      // Arrange - Start timer with TRIP message
      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);
      const firstTimer = vehicle['_tripDebounceTimer'];

      // Act - Send non-TRIP message
      const nonTripMessage = createStreamMessage({
        'vehicleStatus.mileage': { value: 15000, unit: 'km', timestamp: '2025-01-15T10:00:10Z' },
      });
      await vehicle['checkAndDebounceTripCompletion'](nonTripMessage);

      // Assert - Timer should be reset (different instance)
      expect(vehicle['_tripDebounceTimer']).toBeDefined();
      expect(vehicle['_tripDebounceTimer']).not.toBe(firstTimer);
    });
  });

  describe('Timer Behavior', () => {
    it('should_triggerFlow_when_timerExpires', async () => {
      // Arrange
      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);

      // Advance timers and wait for promises
      await jest.runAllTimersAsync();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MQTT messages stopped - triggering drive_session_completed'
      );
      expect(mockFlowCard.trigger).toHaveBeenCalled();
    });

    it('should_clearTimer_when_timerExpires', async () => {
      // Arrange
      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);
      expect(vehicle['_tripDebounceTimer']).toBeDefined();

      await jest.runAllTimersAsync();

      // Assert
      expect(vehicle['_tripDebounceTimer']).toBeUndefined();
    });
  });

  describe('Flow Trigger Data', () => {
    it('should_triggerFlowWithCorrectData_when_tripCompletes', async () => {
      // Arrange
      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);
      await jest.runAllTimersAsync();

      // Assert
      expect(mockFlowCard.trigger).toHaveBeenCalledWith(
        vehicle,
        {
          StartLabel: 'Home',
          StartLatitude: 52.5,
          StartLongitude: 13.4,
          StartAddress: 'Start Address',
          StartMileage: 14950,
          EndLabel: '',
          EndLatitude: 52.52,
          EndLongitude: 13.405,
          EndAddress: 'Test Address, Berlin',
          EndMileage: 15000,
        },
        {}
      );
    });

    it('should_persistTripEndData_when_flowTriggers', async () => {
      // Arrange
      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);
      await jest.runAllTimersAsync();

      // Assert
      expect(mockStateManager.setLastTripCompleteLocation).toHaveBeenCalledWith({
        label: '',
        latitude: 52.52,
        longitude: 13.405,
        address: 'Test Address, Berlin',
      });
      expect(mockStateManager.setLastTripCompleteMileage).toHaveBeenCalledWith(15000);
    });

    it('should_notTriggerFlow_when_noStartLocation', async () => {
      // Arrange
      mockStateManager.getLastTripCompleteLocation.mockReturnValue(undefined);

      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);
      await jest.runAllTimersAsync();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No start location available for trip completion'
      );
      expect(mockFlowCard.trigger).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should_handleError_when_getTripCategoryKeysFails', async () => {
      // Arrange
      (getKeysByCategory as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to get keys');
      });

      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to check trip completion: Failed to get keys'
      );
    });

    it('should_handleError_when_flowTriggerFails', async () => {
      // Arrange
      mockFlowCard.trigger.mockRejectedValue(new Error('Flow trigger failed'));

      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['checkAndDebounceTripCompletion'](tripMessage);
      await jest.runAllTimersAsync();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to trigger drive session completed: Flow trigger failed'
      );
    });
  });

  describe('Integration with handleMqttMessage', () => {
    it('should_callCheckAndDebounceTripCompletion_when_mqttMessageReceived', async () => {
      // Arrange
      const checkSpy = jest.spyOn(vehicle as any, 'checkAndDebounceTripCompletion');

      const tripMessage = createStreamMessage({
        'trip.distance': { value: 10, unit: 'km', timestamp: '2025-01-15T10:00:00Z' },
      });

      // Act
      await vehicle['handleMqttMessage']('gcid/TEST_VIN_123', tripMessage);

      // Assert
      expect(checkSpy).toHaveBeenCalledWith(tripMessage);
      expect(mockStateManager.updateFromMqttMessage).toHaveBeenCalledWith(tripMessage);
    });
  });
});
