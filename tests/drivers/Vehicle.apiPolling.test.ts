/**
 * Tests for Vehicle API Polling Methods
 *
 * Validates startApiPolling, canStartApiPolling, and executePoll methods.
 * Tests validation logic, polling setup, execution, and error handling.
 */

import { Vehicle } from '../../drivers/Vehicle';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

describe('Vehicle API Polling', () => {
  let vehicle: Vehicle;
  let mockLogger: any;
  let mockStateManager: any;
  let mockApiClient: any;
  let mockSettings: any;
  let mockDeviceData: any;
  let mockStore: Record<string, any>;

  beforeEach(() => {
    // Create mock API client
    mockApiClient = {
      getRawTelematicData: jest.fn(),
    };

    // Create mock state manager
    mockStateManager = {
      updateFromApi: jest.fn().mockResolvedValue({
        vin: 'TEST_VIN_123',
        driveTrain: 'ELECTRIC',
        lastUpdatedAt: new Date(),
      }),
      getVehicleStatus: jest.fn().mockReturnValue({
        vin: 'TEST_VIN_123',
        driveTrain: 'ELECTRIC',
        lastUpdatedAt: new Date(),
      }),
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      getContainerId: jest.fn().mockReturnValue('test-container-123'),
      getDriveTrain: jest.fn().mockReturnValue('ELECTRIC'),
    };

    // Create mock store
    mockStore = {};

    // Create Vehicle instance using helper
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockLogger = result.mocks.mockLogger;
    mockSettings = result.mocks.mockSettings;
    mockDeviceData = result.mocks.mockDeviceData;

    // Override device data
    mockDeviceData.id = 'TEST_VIN_123';

    // Configure settings for polling tests
    mockSettings.apiPollingEnabled = true;
    mockSettings.apiPollingInterval = 60;

    vehicle['stateManager'] = mockStateManager;
    vehicle['_carDataClient'] = mockApiClient;
    vehicle['_apiPollingTimer'] = undefined;

    // Mock store methods
    vehicle.getStoreValue = jest.fn((key: string) => mockStore[key]);
    vehicle.setStoreValue = jest.fn((key: string, value: any) => {
      mockStore[key] = value;
      return Promise.resolve();
    });

    // Set default container ID
    mockStore['containerId'] = 'test-container-123';

    // Mock stopApiPolling
    vehicle['stopApiPolling'] = jest.fn();
  });

  afterEach(() => {
    // Clean up any timers
    if (vehicle['_apiPollingTimer']) {
      clearInterval(vehicle['_apiPollingTimer']);
    }
    jest.clearAllTimers();
  });

  describe('canStartApiPolling', () => {
    it('should_returnTrue_when_allPrerequisitesMet', () => {
      // Arrange - all prerequisites already set in beforeEach

      // Act
      const result = vehicle['canStartApiPolling'](mockSettings);

      // Assert
      expect(result.canStart).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should_returnFalse_when_apiPollingDisabled', () => {
      // Arrange
      mockSettings.apiPollingEnabled = false;

      // Act
      const result = vehicle['canStartApiPolling'](mockSettings);

      // Assert
      expect(result.canStart).toBe(false);
      expect(result.reason).toBe('API polling is disabled in settings');
    });

    it('should_returnFalse_when_noApiClient', () => {
      // Arrange
      vehicle['_carDataClient'] = undefined;

      // Act
      const result = vehicle['canStartApiPolling'](mockSettings);

      // Assert
      expect(result.canStart).toBe(false);
      expect(result.reason).toBe('API client not initialized - cannot start API polling');
    });

    it('should_returnFalse_when_noContainerId', () => {
      // Arrange
      mockStateManager.getContainerId.mockReturnValue(undefined);

      // Act
      const result = vehicle['canStartApiPolling'](mockSettings);

      // Assert
      expect(result.canStart).toBe(false);
      expect(result.reason).toBe('No container ID available - API polling requires container');
    });
  });

  describe('executePoll', () => {
    it('should_fetchAndUpdateData_when_validPrerequisites', async () => {
      // Arrange
      const mockRawData = {
        mileage: '12345',
        fuelLevel: '50',
        batteryLevel: '80',
      };
      mockApiClient.getRawTelematicData.mockResolvedValue(mockRawData);

      // Act
      await vehicle['executePoll']();

      // Assert
      expect(mockApiClient.getRawTelematicData).toHaveBeenCalledWith(
        'TEST_VIN_123',
        'test-container-123'
      );
      expect(mockStateManager.updateFromApi).toHaveBeenCalledWith(mockRawData);
      expect(mockLogger.debug).toHaveBeenCalledWith('Polling API for vehicle TEST_VIN_123');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'API poll completed for vehicle TEST_VIN_123 (3 telematic keys)'
      );
    });

    it('should_skipPoll_when_noApiClient', async () => {
      // Arrange
      vehicle['_carDataClient'] = undefined;

      // Act
      await vehicle['executePoll']();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith('API client unavailable - skipping poll');
      expect(mockApiClient.getRawTelematicData).not.toHaveBeenCalled();
    });

    it('should_skipPoll_when_noContainerId', async () => {
      // Arrange
      mockStateManager.getContainerId.mockReturnValue(undefined);

      // Act
      await vehicle['executePoll']();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith('Container ID missing - skipping API poll');
      expect(mockApiClient.getRawTelematicData).not.toHaveBeenCalled();
    });

    it('should_logError_when_apiCallFails', async () => {
      // Arrange
      const error = new Error('API connection timeout');
      mockApiClient.getRawTelematicData.mockRejectedValue(error);

      // Act
      await vehicle['executePoll']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'API polling error for vehicle TEST_VIN_123: API connection timeout'
      );
      expect(mockStateManager.updateFromApi).not.toHaveBeenCalled();
    });

    it('should_logError_when_stateManagerUpdateFails', async () => {
      // Arrange
      const mockRawData = { mileage: '12345' };
      mockApiClient.getRawTelematicData.mockResolvedValue(mockRawData);
      const error = new Error('State update failed');
      mockStateManager.updateFromApi.mockRejectedValue(error);

      // Act
      await vehicle['executePoll']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'API polling error for vehicle TEST_VIN_123: State update failed'
      );
    });

    it('should_handleNonErrorException_when_exceptionIsNotError', async () => {
      // Arrange
      mockApiClient.getRawTelematicData.mockRejectedValue('String error');

      // Act
      await vehicle['executePoll']();

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'API polling error for vehicle TEST_VIN_123: String error'
      );
    });
  });

  describe('startApiPolling', () => {
    beforeEach(() => {
      // Restore real stopApiPolling for these tests
      vehicle['stopApiPolling'] = Vehicle.prototype['stopApiPolling'].bind(vehicle);
      // Mock executePoll to avoid actual execution
      vehicle['executePoll'] = jest.fn().mockResolvedValue(undefined);
      jest.useFakeTimers();
    });

    afterEach(() => {
      // Clean up any timers before switching back to real timers
      if (vehicle['_apiPollingTimer']) {
        clearInterval(vehicle['_apiPollingTimer']);
        vehicle['_apiPollingTimer'] = undefined;
      }
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should_startPolling_when_validPrerequisites', () => {
      // Arrange & Act
      vehicle['startApiPolling']();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting API polling for vehicle TEST_VIN_123 (interval: 60 minutes)'
      );
      expect(vehicle['executePoll']).toHaveBeenCalledTimes(1); // Immediate poll
      expect(vehicle['_apiPollingTimer']).toBeDefined();
    });

    it('should_executeImmediatePoll_when_pollingStarts', () => {
      // Arrange & Act
      vehicle['startApiPolling']();

      // Assert
      expect(vehicle['executePoll']).toHaveBeenCalledTimes(1);
    });

    it('should_setupIntervalTimer_when_pollingStarts', () => {
      // Arrange & Act
      vehicle['startApiPolling']();

      // Fast-forward 60 minutes
      jest.advanceTimersByTime(60 * 60 * 1000);

      // Assert
      expect(vehicle['executePoll']).toHaveBeenCalledTimes(2); // Immediate + 1 interval
    });

    it('should_pollMultipleTimes_when_intervalPasses', () => {
      // Arrange & Act
      vehicle['startApiPolling']();

      // Fast-forward 3 hours (3 intervals)
      jest.advanceTimersByTime(3 * 60 * 60 * 1000);

      // Assert
      expect(vehicle['executePoll']).toHaveBeenCalledTimes(4); // Immediate + 3 intervals
    });

    it('should_notStartPolling_when_apiPollingDisabled', () => {
      // Arrange
      mockSettings.apiPollingEnabled = false;

      // Act
      vehicle['startApiPolling']();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('API polling is disabled in settings');
      expect(vehicle['executePoll']).not.toHaveBeenCalled();
      expect(vehicle['_apiPollingTimer']).toBeUndefined();
    });

    it('should_notStartPolling_when_noApiClient', () => {
      // Arrange
      vehicle['_carDataClient'] = undefined;

      // Act
      vehicle['startApiPolling']();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'API client not initialized - cannot start API polling'
      );
      expect(vehicle['executePoll']).not.toHaveBeenCalled();
    });

    it('should_notStartPolling_when_noContainerId', () => {
      // Arrange
      mockStateManager.getContainerId.mockReturnValue(undefined);

      // Act
      vehicle['startApiPolling']();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No container ID available - API polling requires container'
      );
      expect(vehicle['executePoll']).not.toHaveBeenCalled();
    });

    it('should_useCustomInterval_when_intervalSet', () => {
      // Arrange
      mockSettings.apiPollingInterval = 45; // 45 minutes

      // Act
      vehicle['startApiPolling']();

      // Fast-forward 45 minutes
      jest.advanceTimersByTime(45 * 60 * 1000);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting API polling for vehicle TEST_VIN_123 (interval: 45 minutes)'
      );
      expect(vehicle['executePoll']).toHaveBeenCalledTimes(2); // Immediate + 1 interval
    });

    it('should_stopExistingTimer_when_startingNewPolling', () => {
      // Arrange
      const mockStopPolling = jest.fn();
      vehicle['stopApiPolling'] = mockStopPolling;

      // Act
      vehicle['startApiPolling']();

      // Assert
      expect(mockStopPolling).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopApiPolling', () => {
    beforeEach(() => {
      // Restore real stopApiPolling
      vehicle['stopApiPolling'] = Vehicle.prototype['stopApiPolling'].bind(vehicle);
    });

    it('should_clearTimer_when_timerExists', () => {
      // Arrange
      vehicle['_apiPollingTimer'] = setInterval(() => {}, 1000) as NodeJS.Timeout;

      // Act
      vehicle['stopApiPolling']();

      // Assert
      expect(vehicle['_apiPollingTimer']).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopped API polling for vehicle TEST_VIN_123');
    });

    it('should_doNothing_when_noTimerExists', () => {
      // Arrange
      vehicle['_apiPollingTimer'] = undefined;

      // Act
      vehicle['stopApiPolling']();

      // Assert
      expect(vehicle['_apiPollingTimer']).toBeUndefined();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
