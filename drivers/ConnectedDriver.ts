import { Device, Driver } from 'homey';
import { DeviceData } from '../utils/DeviceData';
import { DeviceSettings } from '../utils/DeviceSettings';
import { DeviceCodeResponse } from '../lib/models';
import { PairSession } from 'homey/lib/Driver';
import { BMWConnectedDrive } from '../app';
import { ILogger } from '../lib';
import {
  STORE_KEY_CLIENT_ID,
  STORE_KEY_CONTAINER_ID,
  STORE_KEY_DEVICE_STATE,
} from '../utils/StoreKeys';
import { DeviceStoreData } from '../utils/DeviceStateManager';

// Import types for factory methods and casting
type DeviceCodeAuthProvider = import('../lib/auth/DeviceCodeAuthProvider').DeviceCodeAuthProvider;
type CarDataClient = import('../lib/api/CarDataClient').CarDataClient;
type ContainerManager = import('../lib/api/ContainerManager').ContainerManager;
type Vehicle = import('./Vehicle').Vehicle;

export abstract class ConnectedDriver extends Driver {
  protected currentDeviceCodeResponse?: DeviceCodeResponse;
  protected currentClientId?: string;
  protected currentContainerId?: string;
  protected pollingCancelled: boolean = false;

  protected abstract get brand(): string;

  protected get app(): BMWConnectedDrive {
    return this.homey.app as BMWConnectedDrive;
  }

  protected get logger(): ILogger | undefined {
    return this.app.logger;
  }

  async onInit() {
    await super.onInit();
  }

  /**
   * Centralised post-authentication completion.
   *
   * Invariants this enforces across every code path that has a valid token
   * (polling success, request_device_code short-circuit, client_id_entered
   * short-circuit):
   * - Token persistence is the auth provider's responsibility; we never
   *   delete tokens from here. Downstream failures (container, store update,
   *   navigation) must not invalidate the OAuth credentials.
   * - Container or device-store failures emit `setup_error`, NEVER
   *   `authentication_error`. Auth itself has already succeeded.
   * - Session-closed errors (user cancelled / navigated away) are logged
   *   and swallowed - they are not failures.
   *
   * Returns true on full success, false if a setup_error was emitted.
   * Throws only for genuinely unexpected programmer errors (none expected).
   */
  protected async completePostAuthSuccess(
    session: PairSession,
    device: Device | undefined
  ): Promise<boolean> {
    // Step 1: container - any failure is setup_error, not auth error.
    try {
      await this.validateOrCreateContainer();
    } catch (containerError) {
      const detail =
        containerError instanceof Error ? containerError.message : String(containerError);
      this.homey.error('Container setup failed:', containerError);
      await this.emitSafely(session, 'setup_error', `Container setup failed: ${detail}`);
      return false;
    }

    // Step 2: repair flow - update device store. Failure is still a setup
    // problem, not an auth problem; tokens remain valid for the next retry.
    if (device) {
      try {
        await this.updateDeviceStore(device);
      } catch (storeError) {
        const detail = storeError instanceof Error ? storeError.message : String(storeError);
        this.homey.error('Device store update failed:', storeError);
        await this.emitSafely(session, 'setup_error', `Device setup failed: ${detail}`);
        return false;
      }
    }

    // Step 3: notify the frontend that auth + setup succeeded.
    await this.emitSafely(session, 'authentication_success', {});

    // Step 4: advance the wizard. Session-closed here is benign (user
    // navigated away after seeing success); other errors are unexpected.
    try {
      if (device) {
        await session.done();
      } else {
        await session.showView('list_devices');
      }
    } catch (navError) {
      if (this.isSessionClosedError(navError)) {
        this.logger?.info('Session closed before navigation - user already moved on');
      } else {
        this.homey.error('Failed to advance pair view after success:', navError);
      }
    }

    return true;
  }

  /**
   * Recognise the family of errors Homey raises when a PairSession is no
   * longer reachable from the backend - the user closed the wizard, navigated
   * away, or the session expired. We've seen at least two surface strings in
   * the wild: 'Not Found: PairSession' (older SDKs) and 'Could not find that
   * PairSession' (Homey Pro 2023 web UI, issue #108 v1.0.23). Match the
   * 'PairSession' marker case-insensitively to cover both - it's a Homey
   * internal type name and won't appear in legitimate errors.
   */
  private isSessionClosedError(error: unknown): boolean {
    return error instanceof Error && /pairsession/i.test(error.message);
  }

  /**
   * Emit a session event, swallowing only the "session closed" race that
   * happens when the user cancels mid-flow. Every other emit failure is
   * surfaced so we don't paper over real bugs.
   */
  private async emitSafely(session: PairSession, event: string, payload: unknown): Promise<void> {
    try {
      await session.emit(event, payload);
    } catch (emitError) {
      if (this.isSessionClosedError(emitError)) {
        this.logger?.info(`Session closed - cannot emit ${event}`);
      } else {
        this.homey.error(`Failed to emit ${event}:`, emitError);
      }
    }
  }

  /**
   * Get shared auth provider from app
   * Protected to allow test overrides
   */
  protected getAuthProvider(): DeviceCodeAuthProvider {
    if (!this.currentClientId) {
      throw new Error('Client ID not initialized');
    }

    return this.app.getAuthProvider(this.currentClientId);
  }

  /**
   * Get shared CarDataClient from app
   * Protected to allow test overrides
   */
  protected getCarDataClient(): CarDataClient {
    if (!this.currentClientId) {
      throw new Error('Client ID not initialized');
    }

    return this.app.getApiClient(this.currentClientId);
  }

  /**
   * Factory method for creating ContainerManager
   * Protected to allow test overrides
   */
  protected async createContainerManager(): Promise<ContainerManager> {
    if (!this.currentClientId) {
      throw new Error('Client ID not initialized');
    }

    // Use app's factory method to create HttpClient with consistent configuration
    const httpClient = this.app.createHttpClient();

    // Get shared auth provider from app
    const authProvider = this.getAuthProvider();

    const { ContainerManager } = await import('../lib/api/ContainerManager');
    return new ContainerManager({
      httpClient,
      getAccessToken: async () => {
        return await authProvider.getValidAccessToken();
      },
      logger: this.logger,
    });
  }

  async onPair(session: PairSession) {
    await Promise.resolve();

    this.logger?.info('Pairing started');

    // Attempt to retrieve the client id and container id from existing devices.
    const drivers = this.homey.drivers.getDrivers() as { [key: string]: Driver };
    for (const driver of Object.values(drivers)) {
      for (const device of driver.getDevices()) {
        // Cast to Vehicle to access state manager
        const vehicleDevice = device as Vehicle;
        const clientId = vehicleDevice.stateManager.getClientId();
        const containerId = vehicleDevice.stateManager.getContainerId();
        if (!this.currentClientId && clientId) {
          this.currentClientId = clientId;
        }
        if (!this.currentContainerId && containerId) {
          this.currentContainerId = containerId;
        }
      }
    }

    this.setSessionPairRepairHandlers(session);

    session.setHandler('list_devices', async () => {
      // Get shared CarDataClient from app to list vehicles during pairing
      // This client uses the freshly authenticated tokens from the pairing flow
      if (!this.currentClientId) {
        throw new Error('Authentication not completed - please authenticate first');
      }

      // Issue #108 (aagehellem): rapid double-click on "Get Code" could land
      // the user on list_devices before container creation had finished, which
      // persisted a half-formed device with `containerId: undefined`. Refuse
      // to enumerate vehicles until the container step has completed so the
      // user is forced to retry rather than ending up with a broken device.
      if (!this.currentContainerId) {
        throw new Error('Container setup is not yet complete - please cancel and retry pairing');
      }

      const api = this.getCarDataClient();

      // Note: Container management now happens in pollForAuthorizationAsync
      // for both pairing and repair flows

      const vehicles = await api.getVehicles();

      return vehicles
        .filter((vehicle) => {
          // BMW CarData returns sub-brand identifiers like `BMW_I` (for electric iX/i3/i4
          // etc.) and may use similar prefixes for MINI. Match on the brand family prefix
          // so sub-brand vehicles are not silently dropped during pairing (issues #103, #105).
          const brand = (vehicle.brand ?? '').toLowerCase();
          return brand.startsWith(this.brand.toLowerCase());
        })
        .map((vehicle) => {
          this.logger?.info(
            `Vehicle found: ${vehicle.brand}: ${vehicle.vin}, ${vehicle.model ?? 'Unknown Model'}`
          );

          if (!vehicle.vin) {
            throw new Error('Cannot list vehicle as VIN is empty.');
          }

          // Store VIN as immutable device data
          const deviceData = new DeviceData(vehicle.vin);

          // Store authentication credentials and default device state in device store (dynamic, persistent)
          // Initialize all store keys with defaults to ensure consistent structure
          const deviceState: DeviceStoreData = {
            telematicCache: {},
            vin: vehicle.vin,
            driveTrain: vehicle.driveTrain,
          };
          const store = {
            [STORE_KEY_DEVICE_STATE]: deviceState,
            [STORE_KEY_CLIENT_ID]: this.currentClientId,
            [STORE_KEY_CONTAINER_ID]: this.currentContainerId,
          };

          // Device settings are for user preferences only
          const settings = new DeviceSettings();

          return {
            name: `${vehicle.model} (${vehicle.vin})`,
            data: deviceData,
            store,
            settings,
            icon: 'icon.svg',
          };
        });
    });
  }

  async onRepair(session: PairSession, device: Device) {
    await Promise.resolve();

    // Pre-populate client ID and container ID from device store if available
    const vehicleDevice = device as Vehicle;
    const clientId = vehicleDevice.stateManager.getClientId();
    const containerId = vehicleDevice.stateManager.getContainerId();

    if (clientId && typeof clientId === 'string') {
      this.currentClientId = clientId;
    }
    if (containerId && typeof containerId === 'string') {
      this.currentContainerId = containerId;
    }

    this.setSessionPairRepairHandlers(session, device);
  }

  private setSessionPairRepairHandlers(
    session: PairSession,
    device: Device | undefined = undefined
  ) {
    session.setHandler(
      'client_id_entered',
      async (data: { client_id: string; container_id?: string }) => {
        this.logger?.info(`Client ID provided: ${data.client_id.substring(0, 8)}...`);
        this.currentClientId = data.client_id;

        // Store optional container ID (will be validated later)
        if (data.container_id) {
          this.logger?.info(`Container ID provided: ${data.container_id}`);
          this.currentContainerId = data.container_id;
        } else {
          this.logger?.info(
            'No container ID provided - will create new container after authentication'
          );
          this.currentContainerId = undefined;
        }

        // Check if we already have valid tokens for this client ID.
        // Token lookup failure (no token / expired / refresh failed) means
        // we genuinely need a fresh device code; fall through. Token success
        // hands off to completePostAuthSuccess, which has its own scoped
        // error handling for container / store / navigation steps and never
        // confuses post-auth failures with auth failures.
        let accessToken: string | undefined;
        try {
          const authProvider = this.getAuthProvider();
          accessToken = await authProvider.getValidAccessToken();
        } catch (tokenError) {
          this.logger?.info('No valid tokens found - proceeding with device code authentication', {
            error: tokenError instanceof Error ? tokenError.message : String(tokenError),
          });
        }

        if (accessToken) {
          this.logger?.info('Valid tokens found - skipping device code authentication');
          await this.completePostAuthSuccess(session, device);
          return;
        }

        // No valid tokens - proceed to device code authentication.
        // nextView() can reject if the user closed the pair wizard between
        // pressing Continue and us getting here; treat that as benign so we
        // don't bubble "Could not find that PairSession" toasts back to a UI
        // the user has already left (issue #108 v1.0.23 report from aagehellem).
        try {
          await session.nextView();
        } catch (navError) {
          if (this.isSessionClosedError(navError)) {
            this.logger?.info('Session closed before advancing to device-code view');
          } else {
            this.homey.error('Failed to advance to device-code view:', navError);
            throw navError;
          }
        }
      }
    );

    // Handler for Device Code Flow - request device code
    session.setHandler('request_device_code', async () => {
      try {
        this.log('Requesting device code for repair flow');
        // Reset cancellation flag at start of new flow
        this.pollingCancelled = false;

        if (!this.currentClientId) {
          this.homey.error('Client ID not provided');
          throw new Error('Client ID not provided');
        }

        // Get shared auth provider from app (creates if doesn't exist)
        const authProvider = this.getAuthProvider();

        // Issue #108: if we already have a valid access token (e.g. user is
        // retrying after a container setup failure), skip the device code
        // round-trip entirely. Token lookup is the ONLY failure that should
        // fall through to a new device code; container / store / navigation
        // errors must NOT cause a fresh BMW round-trip - completePostAuthSuccess
        // handles them as setup_error and stays put.
        let existingToken: string | undefined;
        try {
          existingToken = await authProvider.getValidAccessToken();
        } catch (tokenLookupError) {
          this.logger?.debug('No valid tokens for short-circuit - falling through to device code', {
            error:
              tokenLookupError instanceof Error
                ? tokenLookupError.message
                : String(tokenLookupError),
          });
        }

        if (existingToken) {
          this.logger?.info(
            'Valid tokens already present - skipping device code flow and re-running container setup'
          );
          await this.completePostAuthSuccess(session, device);
          // Frontend treats { skipCode: true } as "do not render a device code;
          // backend has driven the view transition already".
          return { skipCode: true };
        }

        this.currentDeviceCodeResponse = await authProvider.requestDeviceCode();

        // Start polling in the background
        void this.pollForAuthorizationAsync(session, device);

        return this.currentDeviceCodeResponse;
      } catch (error) {
        this.homey.error('Failed to request device code:', error);
        throw new Error(
          `Failed to request device code: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // Handler for canceling the pairing
    session.setHandler('cancel_pairing', async () => {
      await Promise.resolve();

      this.logger?.info('Pairing cancelled by user');
      this.pollingCancelled = true;
      this.currentDeviceCodeResponse = undefined;
      await session.done();
    });

    session.setHandler('showView', async (view: string) => {
      if (view === 'client_id') {
        this.logger?.info('Client ID view ready - sending prefill data');
        await session.emit('client_id_prefill', {
          client_id: this.currentClientId,
          container_id: this.currentContainerId,
        });
      }
    });
  }

  /**
   * Poll for authorization in the background
   * Emits events to the pairing session when authorization completes or fails
   */
  private async pollForAuthorizationAsync(session: PairSession, device?: Device): Promise<void> {
    if (!this.currentClientId || !this.currentDeviceCodeResponse) {
      return;
    }

    // Capture the device code this poll loop started with (issue: stale poll
    // loops can otherwise emit success/error against a newer pairing attempt
    // when the user retries the request_device_code step).
    const ownDeviceCode = this.currentDeviceCodeResponse.deviceCode;

    try {
      // Get shared auth provider from app
      const authProvider = this.getAuthProvider();

      // Start the polling process
      const pollingPromise = authProvider.pollForTokens(ownDeviceCode);

      // Check cancellation status periodically
      const checkCancellation = async (): Promise<void> => {
        while (!this.pollingCancelled) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error('Authorization cancelled by user');
      };

      // Race between polling completion and cancellation
      await Promise.race([pollingPromise, checkCancellation()]);

      // If we get here, polling succeeded (not cancelled)
      if (this.pollingCancelled) {
        this.homey.log('Polling was cancelled');
        return;
      }

      // Bail out silently if a newer pairing attempt has superseded this poll
      if (this.currentDeviceCodeResponse?.deviceCode !== ownDeviceCode) {
        this.logger?.info('Stale poll loop completed - newer device code is active, abandoning');
        return;
      }

      // Container validation/creation now happens in pollForAuthorizationAsync
      // for both pairing and repair flows.
      //
      // Token persistence: DeviceCodeAuthProvider.pollForTokens has already
      // written the tokens to the token store at this point, so even if the
      // container step below fails the user can retry pairing without going
      // through the device-code flow again - request_device_code and
      // client_id_entered both short-circuit on stored tokens. Failures
      // inside completePostAuthSuccess emit `setup_error`, NOT
      // `authentication_error` (auth itself succeeded), and tokens are never
      // cleared on container / store failure.
      if (this.currentDeviceCodeResponse?.deviceCode !== ownDeviceCode) {
        // Superseded by a newer pairing attempt between auth and container.
        return;
      }
      await this.completePostAuthSuccess(session, device);
    } catch (error) {
      // Check if this was a cancellation
      if (this.pollingCancelled) {
        this.homey.log('Authorization cancelled by user');
        return;
      }

      // Check if error is from closed session (don't report as auth failure)
      if (this.isSessionClosedError(error)) {
        this.logger?.info('Session closed before authentication completed - user likely cancelled');
        return;
      }

      // Real authentication error - log it
      this.homey.error('Authentication failed:', error);

      // Determine error message
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';

      // Try to notify frontend - will silently fail if session closed
      await session.emit('authentication_error', errorMessage).catch((emitError) => {
        if (this.isSessionClosedError(emitError)) {
          this.logger?.info('Session closed - cannot report error to user');
        } else {
          this.homey.error('Failed to emit authentication error:', emitError);
        }
      });
    }
  }

  /**
   * Ensure container is ready (validate existing or create new)
   * Called after successful authentication (either via tokens or device code)
   */
  protected async validateOrCreateContainer(): Promise<void> {
    if (!this.currentContainerId) {
      await this.createNewContainer();
    } else {
      await this.validateExistingContainer();
    }
  }

  /**
   * Create new container for authentication
   */
  protected async createNewContainer(): Promise<void> {
    this.logger?.info('No container ID - creating new container after authentication');

    const containerManager = await this.createContainerManager();

    try {
      // Create container - use client ID as identifier (containers are per-GCID, not per-VIN)
      // Multiple vehicles under same GCID share the same container
      const containerKey = `HOMEY-${this.currentClientId?.substring(0, 8)}`;
      this.currentContainerId = await containerManager.getOrCreateContainer(containerKey);
      this.logger?.info(`Container created: ${this.currentContainerId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error(`Failed to create container: ${errorMessage}`);
      throw new Error(`Failed to create container: ${errorMessage}`);
    }
  }

  /**
   * Validate existing user-provided container
   */
  protected async validateExistingContainer(): Promise<void> {
    if (!this.currentContainerId) {
      throw new Error('Container ID is required for validation');
    }

    this.logger?.info(`Validating user-provided container ID: ${this.currentContainerId}`);

    const containerManager = await this.createContainerManager();
    const { ApiError } = await import('../lib/types/errors');

    try {
      const validation = await containerManager.validateContainer(this.currentContainerId);

      if (!validation.isValid) {
        this.logger?.warn(
          `Container ${this.currentContainerId} is missing ${validation.missingKeys?.length} required keys`
        );
        throw new Error(
          `Container is missing ${validation.missingKeys?.length} required keys. Please use a different container or leave empty to create a new one.`
        );
      }

      this.logger?.info(`Container ${this.currentContainerId} validated successfully`);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        throw new Error(
          'Container ID not found. Please check the ID or leave empty to create a new one.'
        );
      }
      throw error;
    }
  }

  /**
   * Update device store with new client ID and container ID
   * Triggers device reinitialization if values changed
   */
  protected async updateDeviceStore(device: Device): Promise<void> {
    if (!this.currentClientId) {
      this.logger?.warn('No client ID to update in device store');
      return;
    }

    // Cast to Vehicle to access state manager and reinitialize method
    const vehicleDevice = device as Vehicle;

    // Update device store with client ID and container ID (if changed)
    const currentClientId = vehicleDevice.stateManager.getClientId();
    const currentContainerId = vehicleDevice.stateManager.getContainerId();

    if (
      currentClientId === this.currentClientId &&
      currentContainerId === this.currentContainerId
    ) {
      this.logger?.info('Device store already up to date - no changes needed');
    } else {
      this.logger?.info('Device store changed - updating...');

      // Update device store via state manager
      await vehicleDevice.stateManager.setClientId(this.currentClientId);
      if (this.currentContainerId) {
        await vehicleDevice.stateManager.setContainerId(this.currentContainerId);
      }
    }

    // IMPORTANT: Store changes don't trigger lifecycle methods - must explicitly reinitialize
    this.logger?.info('Reinitializing device after authentication change');
    try {
      await vehicleDevice.initializeVehicleDataAndServices();

      await device.setAvailable();

      this.logger?.info('Device reinitialized successfully after authentication change');
    } catch (error) {
      this.logger?.error(
        'Failed to reinitialize device after authentication change',
        error instanceof Error ? error : undefined
      );
    }
  }
}
