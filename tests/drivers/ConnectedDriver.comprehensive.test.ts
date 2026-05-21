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

type MockSession = {
  setHandler: jest.Mock<void, [string, (...args: unknown[]) => unknown]>;
  emit: jest.Mock<Promise<void>, [string, unknown]>;
  done: jest.Mock<Promise<void>, []>;
  nextView: jest.Mock<Promise<void>, []>;
  showView: jest.Mock<Promise<void>, [string]>;
};

class TestableConnectedDriver extends ConnectedDriver {
  public readonly mockAuthProvider: MockAuthProvider;
  public readonly mockCarDataClient: MockCarDataClient;

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
      showView: jest.fn().mockResolvedValue(undefined),
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
    // Container provisioning was moved out of the pair/repair flow in v1.0.25 -
    // it now runs lazily on the first API poll (Vehicle.ensureContainer). The
    // driver no longer owns those methods; their tests live alongside Vehicle.
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

    // Regression: issue #108 (aagehellem) - in v1.0.18-v1.0.24 the list_devices
    // handler threw if currentContainerId was undefined, forcing the user to
    // restart pairing if container creation hadn't completed yet. v1.0.25 moves
    // container creation to the first API poll, so list_devices must persist
    // the device even when currentContainerId is undefined.
    it('should_persistDeviceWithUndefinedContainer_when_listDevicesRunsBeforeFirstPoll', async () => {
      // Arrange
      driver.setCurrentContainerIdForTest(undefined);

      // Act
      await driver.onPair(mockSession as unknown as any);
      const listHandler = mockSession.setHandler.mock.calls.find(
        (call) => call[0] === 'list_devices'
      )?.[1];
      const devices = await (
        listHandler as () => Promise<
          Array<{ store: Record<string, unknown>; data: { id: string } }>
        >
      )();

      // Assert - device is returned; container is undefined and will be filled
      // in by Vehicle.ensureContainer on the first poll.
      expect(devices).toHaveLength(1);
      expect(devices[0].store[STORE_KEY_CONTAINER_ID]).toBeUndefined();
    });
  });

  describe('Post-auth failure handling', () => {
    beforeEach(async () => {
      await driver.onInit();
      driver.setCurrentClientIdForTest('post-auth-client');
      driver.setCurrentDeviceCodeResponseForTest({ deviceCode: 'dc-active' });
      driver.setPollingCancelledForTest(false);
    });

    // Note: v1.0.25 removed container provisioning from the pair/repair flow
    // entirely (now lazy in Vehicle.ensureContainer), so the pre-v1.0.25 tests
    // for container-failure-during-auth (CU-105 / CU-429 mid-pair, short-circuit
    // container retry, request_device_code container failure) have been removed.
    // Container failures now log a warning and are retried on the next poll
    // cycle, with no UI surface.

    // Issue #108 (aagehellem, v1.0.22): "BMW LOGIN SUCCESSFUL" but Homey stuck on
    // "Waiting for authorization...". Root cause: the polling success path emitted
    // `authentication_success` but never navigated the pair view, so the frontend's
    // listener only updated the status text and the user remained on device_code.
    // For pair, must call showView('list_devices'); for repair, must call done().
    it('should_navigateToListDevices_when_pairFlowAuthSucceeds', async () => {
      // Arrange - pair flow (no device), auth succeeds
      driver.mockAuthProvider.pollForTokens.mockResolvedValue(undefined as never);
      driver.setCurrentContainerIdForTest('existing-container');

      // Act
      await driver.testPollForAuthorizationAsync(mockSession);

      // Assert - success event + showView to advance the wizard
      const successEmits = mockSession.emit.mock.calls.filter(
        (c) => c[0] === 'authentication_success'
      );
      expect(successEmits).toHaveLength(1);
      expect(mockSession.showView).toHaveBeenCalledWith('list_devices');
    });

    it('should_callDone_when_repairFlowAuthSucceeds', async () => {
      // Arrange - repair flow (device passed), auth succeeds.
      // updateDeviceStore touches vehicleDevice.stateManager + initialize +
      // setAvailable, so mock those out to keep this test focused on the
      // navigation contract (session.done() must be called).
      const mockDevice = {
        stateManager: {
          getClientId: jest.fn().mockReturnValue('post-auth-client'),
          getContainerId: jest.fn().mockReturnValue('existing-container'),
          setClientId: jest.fn().mockResolvedValue(undefined),
          setContainerId: jest.fn().mockResolvedValue(undefined),
        },
        initializeVehicleDataAndServices: jest.fn().mockResolvedValue(undefined),
        setAvailable: jest.fn().mockResolvedValue(undefined),
      };
      driver.mockAuthProvider.pollForTokens.mockResolvedValue(undefined as never);
      driver.setCurrentContainerIdForTest('existing-container');

      // Act
      await driver.testPollForAuthorizationAsync(mockSession, mockDevice);

      // Assert - session.done() closes the repair flow; showView is not used.
      expect(mockSession.done).toHaveBeenCalled();
      expect(mockSession.showView).not.toHaveBeenCalled();
    });

    // Fix D: when request_device_code is invoked again (user clicks retry/back),
    // the previous in-flight poll loop must not race with the new one and emit a
    // misleading authentication_success/authentication_error from its stale state.
    // A simple device-code identity check before emitting prevents the race.
    it('should_notEmitSuccess_when_pollResolvesAfterDeviceCodeChanged', async () => {
      // Arrange - poll loop captures device code 'dc-active'
      driver.setCurrentContainerIdForTest('existing-container');

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

    // Silvinnio's 1.0.20 try-3 scenario regression (pre-v1.0.25): obsolete since
    // container provisioning no longer runs inside the short-circuit. The handler
    // now simply navigates on token success - any container issue surfaces later
    // via the poll cycle's logs.

    // Counterpart: when getValidAccessToken itself throws (no token / refresh
    // failed), the handler must fall through to device-code as before.
    it('should_advanceToDeviceCode_when_shortCircuitTokenLookupFails', async () => {
      // Arrange - token lookup throws (e.g. refresh failed, no stored token)
      mockHomey.drivers.getDrivers.mockReturnValue({});
      driver.mockAuthProvider.getValidAccessToken.mockRejectedValue(new Error('no token'));

      // Act
      await driver.onPair(mockSession as unknown as any);
      const clientIdHandler = mockSession.setHandler.mock.calls.find(
        (call) => call[0] === 'client_id_entered'
      )?.[1] as (data: { client_id: string }) => Promise<void>;
      await clientIdHandler({ client_id: 'new-client' });

      // Assert - advanced to device-code view, no setup_error
      expect(mockSession.nextView).toHaveBeenCalled();
      const setupErrorEmits = mockSession.emit.mock.calls.filter((c) => c[0] === 'setup_error');
      expect(setupErrorEmits).toHaveLength(0);
    });

    // Hazard D: in the repair poll path, updateDeviceStore failure was caught by
    // the outer try and emitted as authentication_error - misleading the UI and
    // implying the user needed to re-authenticate when in fact auth had
    // succeeded and tokens were already persisted. It must emit setup_error.
    it('should_emitSetupError_when_updateDeviceStoreFailsInRepairPoll', async () => {
      // Arrange - poll succeeds, store update fails
      driver.setCurrentContainerIdForTest('existing-container');
      driver.mockAuthProvider.pollForTokens.mockResolvedValue(undefined as never);

      const storeError = new Error('disk full');
      const mockDevice = {
        stateManager: {
          getClientId: jest.fn().mockReturnValue('old-client'),
          getContainerId: jest.fn().mockReturnValue('old-container'),
          setClientId: jest.fn().mockRejectedValue(storeError),
          setContainerId: jest.fn().mockResolvedValue(undefined),
        },
        initializeVehicleDataAndServices: jest.fn().mockResolvedValue(undefined),
        setAvailable: jest.fn().mockResolvedValue(undefined),
      };

      // Act
      await driver.testPollForAuthorizationAsync(mockSession, mockDevice);

      // Assert - setup_error, NOT authentication_error
      const setupErrorEmits = mockSession.emit.mock.calls.filter((c) => c[0] === 'setup_error');
      expect(setupErrorEmits).toHaveLength(1);
      expect(setupErrorEmits[0][1]).toMatch(/disk full/);
      const authErrorEmits = mockSession.emit.mock.calls.filter(
        (c) => c[0] === 'authentication_error'
      );
      expect(authErrorEmits).toHaveLength(0);
      // Repair flow must not advance via done() on failure
      expect(mockSession.done).not.toHaveBeenCalled();
    });

    // Hazard F (request_device_code container failure) is obsolete after
    // v1.0.25 - container work no longer happens in request_device_code, so
    // the short-circuit only short-circuits on auth success and navigates.

    // Hazard E: session-closed errors on the final navigation step (user
    // navigated away after success) must be silently swallowed, not surface as
    // crashes or as setup_error.
    it('should_swallowSessionClosedError_when_doneThrowsAfterRepairSuccess', async () => {
      // Arrange - everything succeeds, but session.done() rejects with the
      // characteristic "Not Found: PairSession" error.
      driver.setCurrentContainerIdForTest('existing-container');
      driver.mockAuthProvider.pollForTokens.mockResolvedValue(undefined as never);
      mockSession.done.mockRejectedValue(new Error('Not Found: PairSession'));

      const mockDevice = {
        stateManager: {
          getClientId: jest.fn().mockReturnValue('client'),
          getContainerId: jest.fn().mockReturnValue('existing-container'),
          setClientId: jest.fn().mockResolvedValue(undefined),
          setContainerId: jest.fn().mockResolvedValue(undefined),
        },
        initializeVehicleDataAndServices: jest.fn().mockResolvedValue(undefined),
        setAvailable: jest.fn().mockResolvedValue(undefined),
      };

      // Act + Assert - must not throw, must not emit setup_error
      await expect(
        driver.testPollForAuthorizationAsync(mockSession, mockDevice)
      ).resolves.toBeUndefined();
      const setupErrorEmits = mockSession.emit.mock.calls.filter((c) => c[0] === 'setup_error');
      expect(setupErrorEmits).toHaveLength(0);
    });

    // Issue #108 v1.0.23 (aagehellem): Homey Pro 2023's web UI surfaces the
    // session-closed race with the wording "Could not find that PairSession"
    // (older SDKs say "Not Found: PairSession"). Three red toasts appeared on
    // the Client ID screen because our handler bubbled the error back to the
    // UI. The isSessionClosedError predicate must match BOTH wordings.
    it('should_swallowSessionClosedError_when_homeyProSaysCouldNotFindThatPairSession', async () => {
      // Arrange - poll succeeds; navigation rejects with the newer
      // "Could not find that PairSession" wording.
      driver.setCurrentContainerIdForTest('existing-container');
      driver.mockAuthProvider.pollForTokens.mockResolvedValue(undefined as never);
      mockSession.showView.mockRejectedValue(new Error('Could not find that PairSession'));

      // Act + Assert - must not throw and must not emit setup_error
      await expect(driver.testPollForAuthorizationAsync(mockSession)).resolves.toBeUndefined();
      const setupErrorEmits = mockSession.emit.mock.calls.filter((c) => c[0] === 'setup_error');
      expect(setupErrorEmits).toHaveLength(0);
    });
  });
});
