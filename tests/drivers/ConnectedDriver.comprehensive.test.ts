/**
 * Comprehensive tests for ConnectedDriver
 *
 * Tests the driver's pairing/authentication flows, container management,
 * and device management capabilities using inheritance-based dependency injection.
 */

import { ConnectedDriver } from '../../drivers/ConnectedDriver';
import { DeviceCodeAuthProvider } from '../../lib/auth/DeviceCodeAuthProvider';

// Mock Homey SDK
jest.mock('homey');

// TestableConnectedDriver that overrides factory methods for testing
class TestableConnectedDriver extends ConnectedDriver {
  // Test doubles for dependencies
  private mockHttpClient: any;
  private mockCarDataClient: any;
  private mockContainerManager: any;

  constructor() {
    super();

    // Initialize test doubles
    this.mockHttpClient = {
      request: jest.fn(),
    };

    this.mockCarDataClient = {
      getVehicles: jest.fn(),
    };

    this.mockContainerManager = {
      getOrCreateContainer: jest.fn(),
      validateContainer: jest.fn(),
    };
  }

  // Override factory methods to return test doubles
  protected async createHttpClient(): Promise<any> {
    return this.mockHttpClient;
  }

  protected async createCarDataClient(): Promise<any> {
    // Keep original validation logic
    if (!this.authProvider) {
      throw new Error('Auth provider not initialized');
    }
    return this.mockCarDataClient;
  }

  protected async createContainerManager(): Promise<any> {
    // Keep original validation logic
    if (!this.authProvider) {
      throw new Error('Auth provider not initialized');
    }
    return this.mockContainerManager;
  }

  // Expose protected methods for testing
  public async testValidateOrCreateContainer(): Promise<void> {
    return this.validateOrCreateContainer();
  }

  public async testCreateNewContainer(): Promise<void> {
    return this.createNewContainer();
  }

  public async testValidateExistingContainer(): Promise<void> {
    return this.validateExistingContainer();
  }

  public async testUpdateDeviceStore(device: any): Promise<void> {
    return this.updateDeviceStore(device);
  }

  // Getters for test doubles
  public get testHttpClient() {
    return this.mockHttpClient;
  }
  public get testCarDataClient() {
    return this.mockCarDataClient;
  }
  public get testContainerManager() {
    return this.mockContainerManager;
  }

  // Expose protected properties for testing
  public setCurrentClientId(clientId: string) {
    this.currentClientId = clientId;
  }
  public setCurrentContainerId(containerId: string) {
    this.currentContainerId = containerId;
  }
  public setAuthProvider(authProvider: DeviceCodeAuthProvider) {
    this.authProvider = authProvider;
  }
  public setPollingCancelled(cancelled: boolean) {
    this.pollingCancelled = cancelled;
  }
  public getCurrentClientId() {
    return this.currentClientId;
  }
  public getCurrentContainerId() {
    return this.currentContainerId;
  }
  public getAuthProvider() {
    return this.authProvider;
  }
  public getPollingCancelled() {
    return this.pollingCancelled;
  }

  // Expose protected factory methods for testing
  public async testCreateHttpClient(): Promise<any> {
    return this.createHttpClient();
  }

  public async testCreateCarDataClient(): Promise<any> {
    return this.createCarDataClient();
  }

  public async testCreateContainerManager(): Promise<any> {
    return this.createContainerManager();
  }

  public testGetHttpClientConfig() {
    return this.getHttpClientConfig();
  }
}

describe('ConnectedDriver - Comprehensive Tests', () => {
  let driver: TestableConnectedDriver;
  let mockHomey: any;
  let mockApp: any;
  let mockLogger: any;
  let mockSession: any;
  let mockDevice: any;
  let mockAuthProvider: jest.Mocked<DeviceCodeAuthProvider>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Create mock app
    mockApp = {
      logger: mockLogger,
      getAuthProvider: jest.fn(),
    };

    // Create mock Homey instance
    mockHomey = {
      app: mockApp,
      log: jest.fn(),
      error: jest.fn(),
      drivers: {
        getDrivers: jest.fn(),
      },
    };

    // Create mock session
    mockSession = {
      setHandler: jest.fn(),
      emit: jest.fn().mockResolvedValue(undefined),
      done: jest.fn().mockResolvedValue(undefined),
      nextView: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock device
    mockDevice = {
      getStoreValue: jest.fn(),
      setStoreValue: jest.fn().mockResolvedValue(undefined),
      setAvailable: jest.fn().mockResolvedValue(undefined),
      reinitializeAfterAuth: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock auth provider
    mockAuthProvider = {
      requestDeviceCode: jest.fn(),
      pollForTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      storeTokens: jest.fn(),
      clearTokens: jest.fn(),
      refreshTokens: jest.fn(),
    } as any;

    // Create driver instance
    driver = new TestableConnectedDriver();
    driver.homey = mockHomey;
  });

  describe('Initialization', () => {
    it('should_initializeLogger_when_onInitCalled', async () => {
      // Arrange - Act
      await driver.onInit();

      // Assert
      expect(driver.logger).toBe(mockLogger);
    });

    it('should_provideHttpClientConfig_when_getHttpClientConfigCalled', () => {
      // Arrange - Act
      const config = driver.testGetHttpClientConfig();

      // Assert
      expect(config).toEqual({
        timeout: 30000,
        maxRetries: 3,
        rateLimit: {
          maxRequests: 50,
          windowMs: 24 * 60 * 60 * 1000,
        },
      });
    });
  });

  describe('Factory Methods', () => {
    beforeEach(async () => {
      await driver.onInit();
      driver.setAuthProvider(mockAuthProvider);
    });

    it('should_createHttpClient_when_factoryMethodCalled', async () => {
      // Arrange - Act
      const httpClient = await driver.testCreateHttpClient();

      // Assert
      expect(httpClient).toBe(driver.testHttpClient);
    });

    it('should_createCarDataClient_when_authProviderInitialized', async () => {
      // Arrange - Act
      const carDataClient = await driver.testCreateCarDataClient();

      // Assert
      expect(carDataClient).toBe(driver.testCarDataClient);
    });

    it('should_throwError_when_createCarDataClientWithoutAuthProvider', async () => {
      // Arrange
      driver.setAuthProvider(undefined as any);

      // Act & Assert
      await expect(driver.testCreateCarDataClient()).rejects.toThrow(
        'Auth provider not initialized'
      );
    });

    it('should_createContainerManager_when_authProviderInitialized', async () => {
      // Arrange - Act
      const containerManager = await driver.testCreateContainerManager();

      // Assert
      expect(containerManager).toBe(driver.testContainerManager);
    });

    it('should_throwError_when_createContainerManagerWithoutAuthProvider', async () => {
      // Arrange
      driver.setAuthProvider(undefined as any);

      // Act & Assert
      await expect(driver.testCreateContainerManager()).rejects.toThrow(
        'Auth provider not initialized'
      );
    });
  });

  describe('Container Management', () => {
    beforeEach(async () => {
      await driver.onInit();
      driver.setAuthProvider(mockAuthProvider);
    });

    describe('Create New Container', () => {
      it('should_createNewContainer_when_noContainerIdProvided', async () => {
        // Arrange
        driver.setCurrentClientId('test-client-id');
        driver.setCurrentContainerId(undefined as any);
        driver.testContainerManager.getOrCreateContainer.mockResolvedValue('new-container-id');

        // Act
        await driver.testCreateNewContainer();

        // Assert
        expect(driver.testContainerManager.getOrCreateContainer).toHaveBeenCalledWith(
          'HOMEY-test-cli'
        );
        expect(driver.getCurrentContainerId()).toBe('new-container-id');
        expect(mockLogger.info).toHaveBeenCalledWith(
          'No container ID - creating new container after authentication'
        );
        expect(mockLogger.info).toHaveBeenCalledWith('Container created: new-container-id');
      });

      it('should_throwError_when_containerCreationFails', async () => {
        // Arrange
        driver.setCurrentClientId('test-client-id');
        const creationError = new Error('Container creation failed');
        driver.testContainerManager.getOrCreateContainer.mockRejectedValue(creationError);

        // Act & Assert
        await expect(driver.testCreateNewContainer()).rejects.toThrow(
          'Failed to create container: Container creation failed'
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to create container: Container creation failed'
        );
      });
    });

    describe('Validate Existing Container', () => {
      it('should_validateContainer_when_containerIdProvided', async () => {
        // Arrange
        driver.setCurrentContainerId('existing-container-id');
        driver.testContainerManager.validateContainer.mockResolvedValue({
          isValid: true,
          missingKeys: [],
        });

        // Act
        await driver.testValidateExistingContainer();

        // Assert
        expect(driver.testContainerManager.validateContainer).toHaveBeenCalledWith(
          'existing-container-id'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Validating user-provided container ID: existing-container-id'
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Container existing-container-id validated successfully'
        );
      });

      it('should_throwError_when_containerValidationReturnsInvalid', async () => {
        // Arrange
        driver.setCurrentContainerId('invalid-container-id');
        driver.testContainerManager.validateContainer.mockResolvedValue({
          isValid: false,
          missingKeys: ['key1', 'key2'],
        });

        // Act & Assert
        await expect(driver.testValidateExistingContainer()).rejects.toThrow(
          'Container is missing 2 required keys. Please use a different container or leave empty to create a new one.'
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Container invalid-container-id is missing 2 required keys'
        );
      });

      it('should_throwError_when_containerNotFound', async () => {
        // Arrange
        driver.setCurrentContainerId('missing-container-id');
        const { ApiError } = require('../../lib/types/errors');
        const notFoundError = new ApiError('Not found', 404);
        driver.testContainerManager.validateContainer.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(driver.testValidateExistingContainer()).rejects.toThrow(
          'Container ID not found. Please check the ID or leave empty to create a new one.'
        );
      });

      it('should_throwError_when_noContainerIdForValidation', async () => {
        // Arrange
        driver.setCurrentContainerId(undefined as any);

        // Act & Assert
        await expect(driver.testValidateExistingContainer()).rejects.toThrow(
          'Container ID is required for validation'
        );
      });
    });

    describe('Validate or Create Container', () => {
      it('should_createContainer_when_noContainerIdProvided', async () => {
        // Arrange
        driver.setCurrentClientId('test-client-id');
        driver.setCurrentContainerId(undefined as any);
        driver.testContainerManager.getOrCreateContainer.mockResolvedValue('new-container-id');

        // Act
        await driver.testValidateOrCreateContainer();

        // Assert
        expect(driver.testContainerManager.getOrCreateContainer).toHaveBeenCalledWith(
          'HOMEY-test-cli'
        );
        expect(driver.getCurrentContainerId()).toBe('new-container-id');
      });

      it('should_validateContainer_when_containerIdProvided', async () => {
        // Arrange
        driver.setCurrentContainerId('existing-container-id');
        driver.testContainerManager.validateContainer.mockResolvedValue({
          isValid: true,
          missingKeys: [],
        });

        // Act
        await driver.testValidateOrCreateContainer();

        // Assert
        expect(driver.testContainerManager.validateContainer).toHaveBeenCalledWith(
          'existing-container-id'
        );
        expect(driver.testContainerManager.getOrCreateContainer).not.toHaveBeenCalled();
      });
    });
  });

  describe('Device Store Management', () => {
    beforeEach(async () => {
      await driver.onInit();
    });

    it('should_updateDeviceStore_when_credentialsChanged', async () => {
      // Arrange
      driver.setCurrentClientId('new-client-id');
      driver.setCurrentContainerId('new-container-id');
      mockDevice.getStoreValue
        .mockReturnValueOnce('old-client-id') // Current clientId
        .mockReturnValueOnce('old-container-id'); // Current containerId

      // Act
      await driver.testUpdateDeviceStore(mockDevice);

      // Assert
      expect(mockDevice.setStoreValue).toHaveBeenCalledWith('clientId', 'new-client-id');
      expect(mockDevice.setStoreValue).toHaveBeenCalledWith('containerId', 'new-container-id');
      expect(mockDevice.setAvailable).toHaveBeenCalled();
      expect(mockDevice.reinitializeAfterAuth).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Device store changed - updating...');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Triggering device reinitialization after authentication change'
      );
    });

    it('should_skipUpdate_when_credentialsUnchanged', async () => {
      // Arrange
      driver.setCurrentClientId('same-client-id');
      driver.setCurrentContainerId('same-container-id');
      mockDevice.getStoreValue
        .mockReturnValueOnce('same-client-id') // Current clientId
        .mockReturnValueOnce('same-container-id'); // Current containerId

      // Act
      await driver.testUpdateDeviceStore(mockDevice);

      // Assert
      expect(mockDevice.setStoreValue).not.toHaveBeenCalled();
      expect(mockDevice.setAvailable).toHaveBeenCalled();
      expect(mockDevice.reinitializeAfterAuth).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Device store already up to date - no changes needed'
      );
    });

    it('should_warnAndReturn_when_noClientIdToUpdate', async () => {
      // Arrange
      driver.setCurrentClientId(undefined as any);

      // Act
      await driver.testUpdateDeviceStore(mockDevice);

      // Assert
      expect(mockDevice.setStoreValue).not.toHaveBeenCalled();
      expect(mockDevice.setAvailable).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('No client ID to update in device store');
    });
  });

  describe('Pairing Flow', () => {
    beforeEach(async () => {
      await driver.onInit();
      mockApp.getAuthProvider.mockReturnValue(mockAuthProvider);
    });

    it('should_setupSessionHandlers_when_onPairCalled', async () => {
      // Arrange
      mockHomey.drivers.getDrivers.mockReturnValue({});

      // Act
      await driver.onPair(mockSession);

      // Assert
      expect(mockSession.setHandler).toHaveBeenCalledWith('list_devices', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith(
        'client_id_entered',
        expect.any(Function)
      );
      expect(mockSession.setHandler).toHaveBeenCalledWith(
        'request_device_code',
        expect.any(Function)
      );
      expect(mockSession.setHandler).toHaveBeenCalledWith('cancel_pairing', expect.any(Function));
      expect(mockSession.setHandler).toHaveBeenCalledWith('showView', expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith('Pairing started');
    });

    it('should_retrieveExistingCredentials_when_devicesExist', async () => {
      // Arrange
      const existingDevice = {
        getStoreValue: jest
          .fn()
          .mockReturnValueOnce('existing-client-id')
          .mockReturnValueOnce('existing-container-id'),
      };
      const mockDriver = {
        getDevices: jest.fn().mockReturnValue([existingDevice]),
      };
      mockHomey.drivers.getDrivers.mockReturnValue({ 'test-driver': mockDriver });

      // Act
      await driver.onPair(mockSession);

      // Assert
      expect(driver.getCurrentClientId()).toBe('existing-client-id');
      expect(driver.getCurrentContainerId()).toBe('existing-container-id');
    });

    describe('List Devices Handler', () => {
      let listDevicesHandler: Function;

      beforeEach(async () => {
        mockHomey.drivers.getDrivers.mockReturnValue({});
        await driver.onPair(mockSession);

        // Extract the list_devices handler
        const setHandlerCalls = mockSession.setHandler.mock.calls;
        const listDevicesCall = setHandlerCalls.find((call: any) => call[0] === 'list_devices');
        listDevicesHandler = listDevicesCall[1];
      });

      it('should_returnVehicleList_when_authenticationCompleted', async () => {
        // Arrange
        driver.setAuthProvider(mockAuthProvider);
        const mockVehicles = [
          { vin: 'TEST123', model: 'BMW X5', brand: 'BMW' },
          { vin: 'TEST456', model: 'Mini Cooper', brand: 'MINI' },
        ];
        driver.testCarDataClient.getVehicles.mockResolvedValue(mockVehicles);
        driver.setCurrentClientId('test-client-id');
        driver.setCurrentContainerId('test-container-id');

        // Act
        const result = await listDevicesHandler();

        // Assert
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('BMW X5 (TEST123)');
        expect(result[0].data.id).toBe('TEST123');
        expect(result[0].store).toEqual({
          clientId: 'test-client-id',
          containerId: 'test-container-id',
        });
        expect(result[0].icon).toBe('icon.svg');
        expect(result[0].settings).toBeDefined();
        expect(mockLogger.info).toHaveBeenCalledWith('Vehicle found: BMW: TEST123, BMW X5');
      });

      it('should_throwError_when_authenticationNotCompleted', async () => {
        // Arrange
        driver.setAuthProvider(undefined as any);

        // Act & Assert
        await expect(listDevicesHandler()).rejects.toThrow(
          'Authentication not completed - please authenticate first'
        );
      });

      it('should_throwError_when_vehicleHasNoVin', async () => {
        // Arrange
        driver.setAuthProvider(mockAuthProvider);
        const mockVehicles = [{ vin: null, model: 'BMW X5', brand: 'BMW' }];
        driver.testCarDataClient.getVehicles.mockResolvedValue(mockVehicles);

        // Act & Assert
        await expect(listDevicesHandler()).rejects.toThrow('Cannot list vehicle as VIN is empty.');
      });
    });
  });

  describe('Repair Flow', () => {
    beforeEach(async () => {
      await driver.onInit();
    });

    it('should_prepopulateCredentials_when_onRepairCalled', async () => {
      // Arrange
      mockDevice.getStoreValue
        .mockReturnValueOnce('existing-client-id')
        .mockReturnValueOnce('existing-container-id');

      // Act
      await driver.onRepair(mockSession, mockDevice);

      // Assert
      expect(driver.getCurrentClientId()).toBe('existing-client-id');
      expect(driver.getCurrentContainerId()).toBe('existing-container-id');
      expect(mockSession.setHandler).toHaveBeenCalledWith(
        'client_id_entered',
        expect.any(Function)
      );
    });

    it('should_handleMissingCredentials_when_deviceStoreEmpty', async () => {
      // Arrange
      mockDevice.getStoreValue.mockReturnValue(undefined);

      // Act
      await driver.onRepair(mockSession, mockDevice);

      // Assert
      expect(driver.getCurrentClientId()).toBeUndefined();
      expect(driver.getCurrentContainerId()).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await driver.onInit();
    });

    it('should_handleContainerManagerErrors_gracefully', async () => {
      // Arrange
      driver.setAuthProvider(mockAuthProvider);
      driver.setCurrentClientId('test-client-id');
      const networkError = new Error('Network timeout');
      driver.testContainerManager.getOrCreateContainer.mockRejectedValue(networkError);

      // Act & Assert
      await expect(driver.testCreateNewContainer()).rejects.toThrow(
        'Failed to create container: Network timeout'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create container: Network timeout');
    });
  });
});
