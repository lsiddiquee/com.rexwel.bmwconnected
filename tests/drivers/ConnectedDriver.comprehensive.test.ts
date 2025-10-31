/**
 * Comprehensive tests for ConnectedDriver
 *
 * Validates pairing/repair flows, container management, and device store updates
 * using a subclass that exposes protected members for assertions and uses
 * the same StoreKey constants as production code.
 */

import { ConnectedDriver } from '../../drivers/ConnectedDriver';
import type { Vehicle } from '../../drivers/Vehicle';
import type { CarDataClient } from '../../lib/api/CarDataClient';
import type { ContainerManager } from '../../lib/api/ContainerManager';
import type { DeviceCodeAuthProvider } from '../../lib/auth/DeviceCodeAuthProvider';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import {
  STORE_KEY_CLIENT_ID,
  STORE_KEY_CONTAINER_ID,
  STORE_KEY_DEVICE_STATE,
} from '../../utils/StoreKeys';
import type { DeviceStoreData } from '../../utils/DeviceStateManager';

jest.mock('homey');

type MockAuthProvider = {
  getValidAccessToken: jest.Mock<Promise<string | undefined>, []>;
  requestDeviceCode: jest.Mock<Promise<unknown>, []>;
  pollForTokens: jest.Mock<Promise<void>, [string]>;
};

type MockCarDataClient = {
  getVehicles: jest.Mock<
    Promise<Array<{ vin: string; model?: string; brand?: string; driveTrain: DriveTrainType }>>,
    []
  >;
};

type MockContainerManager = {
  getOrCreateContainer: jest.Mock<Promise<string>, [string]>;
  validateContainer: jest.Mock<Promise<{ isValid: boolean; missingKeys?: string[] }>, [string]>;
};

type MockSession = {
  setHandler: jest.Mock<void, [string, (...args: unknown[]) => unknown]>;
  emit: jest.Mock<Promise<void>, [string, unknown]>;
  done: jest.Mock<Promise<void>, []>;
  nextView: jest.Mock<Promise<void>, []>;
};

class TestableConnectedDriver extends ConnectedDriver {
  public readonly mockAuthProvider: MockAuthProvider;
  public readonly mockCarDataClient: MockCarDataClient;
  public readonly mockContainerManager: MockContainerManager;

  constructor() {
    super();
    this.mockAuthProvider = {
      getValidAccessToken: jest.fn().mockResolvedValue(undefined),
      requestDeviceCode: jest.fn(),
      pollForTokens: jest.fn(),
    };

    this.mockCarDataClient = {
      getVehicles: jest.fn(),
    };

    this.mockContainerManager = {
      getOrCreateContainer: jest.fn(),
      validateContainer: jest.fn(),
    };
  }

  public setCurrentClientIdForTest(clientId?: string): void {
    this.currentClientId = clientId;
  }

  public setCurrentContainerIdForTest(containerId?: string): void {
    this.currentContainerId = containerId;
  }

  public getCurrentClientIdForTest(): string | undefined {
    return this.currentClientId;
  }

  public getCurrentContainerIdForTest(): string | undefined {
    return this.currentContainerId;
  }

  public setPollingCancelledForTest(cancelled: boolean): void {
    this.pollingCancelled = cancelled;
  }

  protected getAuthProvider(): DeviceCodeAuthProvider {
    if (!this.currentClientId) {
      throw new Error('Client ID not initialized');
    }
    return this.mockAuthProvider as unknown as DeviceCodeAuthProvider;
  }

  protected getCarDataClient(): CarDataClient {
    if (!this.currentClientId) {
      throw new Error('Client ID not initialized');
    }
    return this.mockCarDataClient as unknown as CarDataClient;
  }

  protected async createContainerManager(): Promise<ContainerManager> {
    if (!this.currentClientId) {
      throw new Error('Client ID not initialized');
    }
    return this.mockContainerManager as unknown as ContainerManager;
  }

  public async testValidateOrCreateContainer(): Promise<void> {
    return this.validateOrCreateContainer();
  }

  public async testCreateNewContainer(): Promise<void> {
    return this.createNewContainer();
  }

  public async testValidateExistingContainer(): Promise<void> {
    return this.validateExistingContainer();
  }

  public async testUpdateDeviceStore(device: Vehicle): Promise<void> {
    return this.updateDeviceStore(device);
  }
}

describe('ConnectedDriver - Comprehensive', () => {
  let driver: TestableConnectedDriver;
  let mockHomey: any;
  let mockApp: any;
  let mockLogger: any;
  let mockSession: MockSession;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockApp = {
      logger: mockLogger,
      getAuthProvider: jest.fn(),
      getApiClient: jest.fn(),
      createHttpClient: jest.fn(),
    };

    mockSession = {
      setHandler: jest.fn(),
      emit: jest.fn().mockResolvedValue(undefined),
      done: jest.fn().mockResolvedValue(undefined),
      nextView: jest.fn().mockResolvedValue(undefined),
    };

    mockHomey = {
      app: mockApp,
      log: jest.fn(),
      error: jest.fn(),
      drivers: {
        getDrivers: jest.fn(),
      },
    };

    driver = new TestableConnectedDriver();
    (driver as unknown as { homey: typeof mockHomey }).homey = mockHomey;
  });

  describe('Initialization', () => {
    it('should initialize logger during onInit', async () => {
      await driver.onInit();

      expect(driver.logger).toBe(mockLogger);
    });
  });

  describe('Pairing credential reuse', () => {
    it('should reuse credentials from existing devices', async () => {
      const mockStateManager = {
        getClientId: jest.fn().mockReturnValue('existing-client-id'),
        getContainerId: jest.fn().mockReturnValue('existing-container-id'),
      };
      const mockDevice = { stateManager: mockStateManager };
      const mockDriver = { getDevices: jest.fn().mockReturnValue([mockDevice]) };
      mockHomey.drivers.getDrivers.mockReturnValue({ other: mockDriver });

      await driver.onPair(mockSession as unknown as any);

      expect(driver.getCurrentClientIdForTest()).toBe('existing-client-id');
      expect(driver.getCurrentContainerIdForTest()).toBe('existing-container-id');
    });
  });

  describe('Container management', () => {
    beforeEach(async () => {
      await driver.onInit();
      driver.setCurrentClientIdForTest('test-client-id');
    });

    it('should create container when none provided', async () => {
      driver.setCurrentContainerIdForTest(undefined);
      driver.mockContainerManager.getOrCreateContainer.mockResolvedValue('new-container-id');

      await driver.testValidateOrCreateContainer();

      expect(driver.mockContainerManager.getOrCreateContainer).toHaveBeenCalledWith(
        'HOMEY-test-cli'
      );
      expect(driver.getCurrentContainerIdForTest()).toBe('new-container-id');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'No container ID - creating new container after authentication'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Container created: new-container-id');
    });

    it('should propagate container creation error', async () => {
      driver.setCurrentContainerIdForTest(undefined);
      const failure = new Error('Container creation failed');
      driver.mockContainerManager.getOrCreateContainer.mockRejectedValue(failure);

      await expect(driver.testCreateNewContainer()).rejects.toThrow(
        'Failed to create container: Container creation failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create container: Container creation failed'
      );
    });

    it('should validate existing container', async () => {
      driver.setCurrentContainerIdForTest('existing-container-id');
      driver.mockContainerManager.validateContainer.mockResolvedValue({
        isValid: true,
        missingKeys: [],
      });

      await driver.testValidateExistingContainer();

      expect(driver.mockContainerManager.validateContainer).toHaveBeenCalledWith(
        'existing-container-id'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Validating user-provided container ID: existing-container-id'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Container existing-container-id validated successfully'
      );
    });

    it('should throw when validation reports missing keys', async () => {
      driver.setCurrentContainerIdForTest('invalid-container');
      driver.mockContainerManager.validateContainer.mockResolvedValue({
        isValid: false,
        missingKeys: ['key1'],
      });

      await expect(driver.testValidateExistingContainer()).rejects.toThrow(
        'Container is missing 1 required keys. Please use a different container or leave empty to create a new one.'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Container invalid-container is missing 1 required keys'
      );
    });

    it('should throw friendly error when container not found', async () => {
      const { ApiError } = await import('../../lib/types/errors');
      driver.setCurrentContainerIdForTest('missing-container');
      driver.mockContainerManager.validateContainer.mockRejectedValue(
        new ApiError('Not found', 404)
      );

      await expect(driver.testValidateExistingContainer()).rejects.toThrow(
        'Container ID not found. Please check the ID or leave empty to create a new one.'
      );
    });
  });

  describe('Device store updates', () => {
    beforeEach(async () => {
      await driver.onInit();
    });

    it('should update device store when credentials change', async () => {
      driver.setCurrentClientIdForTest('new-client-id');
      driver.setCurrentContainerIdForTest('new-container-id');

      const mockStateManager = {
        getClientId: jest.fn().mockReturnValue('old-client-id'),
        getContainerId: jest.fn().mockReturnValue('old-container-id'),
        setClientId: jest.fn().mockResolvedValue(undefined),
        setContainerId: jest.fn().mockResolvedValue(undefined),
      };
      const mockVehicle = {
        stateManager: mockStateManager,
        initializeVehicleDataAndServices: jest.fn().mockResolvedValue(undefined),
        setAvailable: jest.fn().mockResolvedValue(undefined),
      } as unknown as Vehicle;

      await driver.testUpdateDeviceStore(mockVehicle);

      expect(mockStateManager.setClientId).toHaveBeenCalledWith('new-client-id');
      expect(mockStateManager.setContainerId).toHaveBeenCalledWith('new-container-id');
      expect(mockVehicle.initializeVehicleDataAndServices).toHaveBeenCalled();
      expect(mockVehicle.setAvailable).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Device store changed - updating...');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reinitializing device after authentication change'
      );
    });

    it('should skip update when credentials unchanged', async () => {
      driver.setCurrentClientIdForTest('same-client-id');
      driver.setCurrentContainerIdForTest('same-container');

      const mockStateManager = {
        getClientId: jest.fn().mockReturnValue('same-client-id'),
        getContainerId: jest.fn().mockReturnValue('same-container'),
        setClientId: jest.fn(),
        setContainerId: jest.fn(),
      };
      const mockVehicle = {
        stateManager: mockStateManager,
        initializeVehicleDataAndServices: jest.fn().mockResolvedValue(undefined),
        setAvailable: jest.fn().mockResolvedValue(undefined),
      } as unknown as Vehicle;

      await driver.testUpdateDeviceStore(mockVehicle);

      expect(mockStateManager.setClientId).not.toHaveBeenCalled();
      expect(mockStateManager.setContainerId).not.toHaveBeenCalled();
      expect(mockVehicle.initializeVehicleDataAndServices).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Device store already up to date - no changes needed'
      );
    });

    it('should warn when client id missing', async () => {
      driver.setCurrentClientIdForTest(undefined);

      const mockVehicle = {
        stateManager: {
          getClientId: jest.fn(),
          getContainerId: jest.fn(),
          setClientId: jest.fn(),
          setContainerId: jest.fn(),
        },
        initializeVehicleDataAndServices: jest.fn(),
        setAvailable: jest.fn(),
      } as unknown as Vehicle;

      await driver.testUpdateDeviceStore(mockVehicle);

      expect(mockLogger.warn).toHaveBeenCalledWith('No client ID to update in device store');
      expect(mockVehicle.initializeVehicleDataAndServices).not.toHaveBeenCalled();
    });
  });

  describe('Pairing list handler', () => {
    beforeEach(async () => {
      await driver.onInit();
      driver.setCurrentClientIdForTest('pair-client-id');
      driver.setCurrentContainerIdForTest('pair-container-id');
      driver.mockCarDataClient.getVehicles.mockResolvedValue([
        {
          vin: 'VIN123',
          model: 'BMW X5',
          brand: 'BMW',
          driveTrain: DriveTrainType.COMBUSTION,
        },
      ]);
      mockHomey.drivers.getDrivers.mockReturnValue({});
    });

    it('should list vehicles with initialized store structure', async () => {
      await driver.onPair(mockSession as unknown as any);

      const listHandlerCall = mockSession.setHandler.mock.calls.find(
        (call) => call[0] === 'list_devices'
      );
      expect(listHandlerCall).toBeDefined();
      const listHandler = listHandlerCall?.[1];
      expect(typeof listHandler).toBe('function');
      const devices = await (
        listHandler as () => Promise<
          Array<{ store: Record<string, unknown>; data: { id: string }; name: string }>
        >
      )();

      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe('BMW X5 (VIN123)');
      expect(devices[0].data.id).toBe('VIN123');

      const store = devices[0].store as Record<string, unknown>;
      expect(store[STORE_KEY_CLIENT_ID]).toBe('pair-client-id');
      expect(store[STORE_KEY_CONTAINER_ID]).toBe('pair-container-id');

      const deviceState = store[STORE_KEY_DEVICE_STATE] as DeviceStoreData;
      expect(deviceState.vin).toBe('VIN123');
      expect(deviceState.driveTrain).toBe(DriveTrainType.COMBUSTION);
      expect(deviceState.telematicCache).toEqual({});

      expect(mockLogger.info).toHaveBeenCalledWith('Vehicle found: BMW: VIN123, BMW X5');
    });

    it('should error when authentication not completed', async () => {
      driver.setCurrentClientIdForTest(undefined);
      await driver.onPair(mockSession as unknown as any);
      const listHandlerCall = mockSession.setHandler.mock.calls.find(
        (call) => call[0] === 'list_devices'
      );
      expect(listHandlerCall).toBeDefined();
      const listHandler = listHandlerCall?.[1];

      await expect((listHandler as () => Promise<unknown>)()).rejects.toThrow(
        'Authentication not completed - please authenticate first'
      );
    });
  });
});
