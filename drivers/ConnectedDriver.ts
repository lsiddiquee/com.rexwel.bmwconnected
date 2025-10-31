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

export class ConnectedDriver extends Driver {
  private app!: BMWConnectedDrive;
  logger?: ILogger;
  protected currentDeviceCodeResponse?: DeviceCodeResponse;
  protected currentClientId?: string;
  protected currentContainerId?: string;
  protected pollingCancelled: boolean = false;

  async onInit() {
    await Promise.resolve();

    this.app = this.homey.app as BMWConnectedDrive;
    this.logger = this.app.logger;
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

      const api = this.getCarDataClient();

      // Note: Container management now happens in pollForAuthorizationAsync
      // for both pairing and repair flows

      const vehicles = await api.getVehicles();

      vehicles.forEach((vehicle) => {
        this.logger?.info(
          `Vehicle found: ${vehicle.brand ?? 'BMW'}: ${vehicle.vin}, ${vehicle.model ?? 'Unknown Model'}`
        );
      });

      return vehicles.map((vehicle) => {
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

        // Check if we already have valid tokens for this client ID
        try {
          const authProvider = this.getAuthProvider();
          const accessToken = await authProvider.getValidAccessToken();
          if (accessToken) {
            this.logger?.info('Valid tokens found - skipping device code authentication');

            // Validate/create container now since we're skipping device code flow
            await this.validateOrCreateContainer();

            // Update device store if this is a repair flow
            if (device) {
              await this.updateDeviceStore(device);
            }

            // Skip device code view and go directly to list_devices/completion
            await session.emit('authentication_success', {});
            await session.done();
            return;
          }
        } catch {
          this.logger?.info('No valid tokens found - proceeding with device code authentication');
        }

        // No valid tokens - proceed to device code authentication
        await session.nextView();
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

    try {
      // Get shared auth provider from app
      const authProvider = this.getAuthProvider();

      // Start the polling process
      const pollingPromise = authProvider.pollForTokens(this.currentDeviceCodeResponse.deviceCode);

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

      // Container validation/creation now happens in client_id_entered handler
      await this.validateOrCreateContainer();

      // Update device store for repair flow
      if (device) {
        await this.updateDeviceStore(device);
      }

      // Notify the frontend
      await session.emit('authentication_success', {});
    } catch (error) {
      // Check if this was a cancellation
      if (this.pollingCancelled) {
        this.homey.log('Authorization cancelled by user');
        return;
      }

      // Check if error is from closed session (don't report as auth failure)
      if (error instanceof Error && error.message.includes('Not Found: PairSession')) {
        this.logger?.info('Session closed before authentication completed - user likely cancelled');
        return;
      }

      // Real authentication error - log it
      this.homey.error('Authentication failed:', error);

      // Determine error message
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';

      // Try to notify frontend - will silently fail if session closed
      await session.emit('authentication_error', errorMessage).catch((emitError) => {
        if (emitError instanceof Error && emitError.message.includes('Not Found: PairSession')) {
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
