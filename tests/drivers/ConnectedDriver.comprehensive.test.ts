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

  protected get brand(): string {
    return 'BMW';
  }

  constructor() {
    super();

    // Mock the Homey Driver base class onInit method

    (ConnectedDriver.prototype as any).__proto__.onInit = jest.fn().mockResolvedValue(undefined);

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

  public async testPollForAuthorizationAsync(session: unknown, device?: unknown): Promise<void> {
    return (
      this as unknown as {
        pollForAuthorizationAsync: (s: unknown, d?: unknown) => Promise<void>;
      }
    ).pollForAuthorizationAsync(session, device);
  }

  public setCurrentDeviceCodeResponseForTest(resp: { deviceCode: string } | undefined): void {
    (this as unknown as { currentDeviceCodeResponse: unknown }).currentDeviceCodeResponse = resp;
  }

  public getLoggerForTest() {
    return this.logger;
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

      expect(driver.getLoggerForTest()).toBe(mockLogger);
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

      const store = devices[0].store;
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

    // Regression: issues #103 and #105 - BMW CarData returns BMW sub-brand identifiers
    // such as `BMW_I` for electric vehicles (iX, i3, i4, i5, i7, iX1, iX3). A strict
    // equality compare against the driver brand `BMW` silently drops these vehicles,
    // so the user sees "vehicle found in log" followed by "no new devices found".
    it('should_includeBmwSubBrandVehicles_when_brandIsBmwI', async () => {
      // Arrange - CarData returns BMW_I for an iX
      driver.mockCarDataClient.getVehicles.mockResolvedValue([
        {
          vin: 'VINIX01',
          model: 'iX xDrive50',
          brand: 'BMW_I',
          driveTrain: DriveTrainType.ELECTRIC,
        },
      ]);

      // Act
      await driver.onPair(mockSession as unknown as any);
      const listHandler = mockSession.setHandler.mock.calls.find(
        (call) => call[0] === 'list_devices'
      )?.[1];
      const devices = await (listHandler as () => Promise<Array<{ data: { id: string } }>>)();

      // Assert - the BMW_I vehicle must be paired by the BMW driver
      expect(devices).toHaveLength(1);
      expect(devices[0].data.id).toBe('VINIX01');
    });

    it('should_excludeMiniVehicles_when_driverIsBmw', async () => {
      // Arrange - mixed list, MINI must not pair under BMW driver
      driver.mockCarDataClient.getVehicles.mockResolvedValue([
        {
          vin: 'VINBMW',
          model: 'X5',
          brand: 'BMW',
          driveTrain: DriveTrainType.COMBUSTION,
        },
        {
          vin: 'VINMINI',
          model: 'Cooper SE',
          brand: 'MINI',
          driveTrain: DriveTrainType.ELECTRIC,
        },
      ]);

      // Act
      await driver.onPair(mockSession as unknown as any);
      const listHandler = mockSession.setHandler.mock.calls.find(
        (call) => call[0] === 'list_devices'
      )?.[1];
      const devices = await (listHandler as () => Promise<Array<{ data: { id: string } }>>)();

      // Assert - only the BMW remains
      expect(devices.map((d) => d.data.id)).toEqual(['VINBMW']);
    });
  });

  describe('Post-auth failure handling', () => {
    beforeEach(async () => {
      await driver.onInit();
      driver.setCurrentClientIdForTest('post-auth-client');
      driver.setCurrentDeviceCodeResponseForTest({ deviceCode: 'dc-active' });
      driver.setPollingCancelledForTest(false);
    });

    // Fix C: when authentication succeeds but container setup fails, the user should
    // see a message that makes the container failure obvious rather than the misleading
    // "Authorization Failed". Auth genuinely succeeded; the post-auth step failed.
    // Reporters of #108 see "Authorization Failed" when CU-105 or similar container
    // errors occur, leading to wasted re-auth attempts.
    it('should_emitContainerErrorMessage_when_containerSetupFailsAfterAuthSuccess', async () => {
      // Arrange - pollForTokens succeeds, but container creation throws with a
      // BMW container error message that does NOT itself mention "container".
      driver.mockAuthProvider.pollForTokens.mockResolvedValue(undefined as never);
      driver.setCurrentContainerIdForTest(undefined);
      driver.mockContainerManager.getOrCreateContainer.mockRejectedValue(
        new Error('HTTP 403: CU-105')
      );

      // Act
      await driver.testPollForAuthorizationAsync(mockSession);

      // Assert - emitted message must explicitly label this as a container setup
      // failure so the user does not waste time re-authenticating.
      const errorEmits = mockSession.emit.mock.calls.filter((c) => c[0] === 'authentication_error');
      expect(errorEmits.length).toBeGreaterThan(0);
      const errorMessage = errorEmits[0][1] as string;
      expect(errorMessage).toMatch(/container setup failed/i);
      expect(errorMessage).toContain('CU-105');
      // Auth success should NOT be emitted
      const successEmits = mockSession.emit.mock.calls.filter(
        (c) => c[0] === 'authentication_success'
      );
      expect(successEmits).toHaveLength(0);
    });

    // Fix D: when request_device_code is invoked again (user clicks retry/back),
    // the previous in-flight poll loop must not race with the new one and emit a
    // misleading authentication_success/authentication_error from its stale state.
    // A simple device-code identity check before emitting prevents the race.
    it('should_notEmitSuccess_when_pollResolvesAfterDeviceCodeChanged', async () => {
      // Arrange - poll loop captures device code 'dc-active'
      driver.setCurrentContainerIdForTest('existing-container');
      driver.mockContainerManager.validateContainer.mockResolvedValue({
        isValid: true,
        missingKeys: [],
      });

      // The contract: the poll loop captures its starting device code and bails
      // out before emitting if it no longer matches. Mid-poll, simulate the user
      // restarting the flow (new request_device_code → new device code stored).
      driver.mockAuthProvider.pollForTokens.mockImplementation(async () => {
        driver.setCurrentDeviceCodeResponseForTest({ deviceCode: 'dc-newer' });
        return undefined as never;
      });

      // Act
      await driver.testPollForAuthorizationAsync(mockSession);

      // Assert - this stale poll must not emit success (the new poll will)
      const successEmits = mockSession.emit.mock.calls.filter(
        (c) => c[0] === 'authentication_success'
      );
      expect(successEmits).toHaveLength(0);
    });
  });
});
