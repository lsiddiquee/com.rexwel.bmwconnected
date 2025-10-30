import { Device, Driver } from 'homey';
import { DeviceData } from '../utils/DeviceData';
import { DeviceSettings } from '../utils/DeviceSettings';
import { DeviceCodeAuthProvider } from '../lib/auth/DeviceCodeAuthProvider';
import { DeviceCodeResponse } from '../lib/models';
import { PairSession } from 'homey/lib/Driver';
import { BMWConnectedDrive } from '../app';
import { ILogger } from '../lib';

export class ConnectedDriver extends Driver {
  logger?: ILogger;
  private currentDeviceCodeResponse?: DeviceCodeResponse;
  private authProvider?: DeviceCodeAuthProvider;
  private currentClientId?: string;
  private currentContainerId?: string;
  private pollingCancelled: boolean = false;

  async onInit() {
    await Promise.resolve();

    const app = this.homey.app as BMWConnectedDrive;
    this.logger = app.logger;
  }

  async onPair(session: PairSession) {
    await Promise.resolve();

    this.logger?.info('Pairing started');

    // Attempt to retrieve the client id and container id from the devices.
    const drivers = this.homey.drivers.getDrivers() as { [key: string]: Driver };
    for (const driver of Object.values(drivers)) {
      for (const device of driver.getDevices()) {
        const clientId = device.getStoreValue('clientId') as string | undefined;
        const containerId = device.getStoreValue('containerId') as string | undefined;
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
      // Create a temporary CarDataClient to list vehicles during pairing
      // This client uses the freshly authenticated tokens from the pairing flow
      if (!this.authProvider) {
        throw new Error('Authentication not completed - please authenticate first');
      }

      const { CarDataClient } = await import('../lib/api/CarDataClient');
      const { HttpClient } = await import('../lib/http/HttpClient');

      const httpClient = new HttpClient({
        timeout: 30000,
        maxRetries: 3,
        rateLimit: {
          maxRequests: 50,
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
        },
      });

      const api = new CarDataClient({
        authProvider: this.authProvider,
        httpClient,
      });

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

        // Store authentication credentials in device store (dynamic, persistent)
        const store = {
          clientId: this.currentClientId,
          containerId: this.currentContainerId,
        };

        // Device settings are for user preferences only
        const settings = new DeviceSettings();

        return {
          name: `${vehicle.model ?? 'BMW Vehicle'} (${vehicle.vin})`,
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
    const clientId = device.getStoreValue('clientId') as string | undefined;
    const containerId = device.getStoreValue('containerId') as string | undefined;

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

        // Get shared auth provider from app
        const app = this.homey.app as BMWConnectedDrive;
        this.authProvider = app.getAuthProvider(this.currentClientId);

        // Check if we already have valid tokens for this client ID
        try {
          const accessToken = await this.authProvider.getValidAccessToken();
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
        const app = this.homey.app as BMWConnectedDrive;
        this.authProvider = app.getAuthProvider(this.currentClientId);

        this.currentDeviceCodeResponse = await this.authProvider.requestDeviceCode();

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
      this.authProvider = undefined;
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
    if (!this.authProvider || !this.currentDeviceCodeResponse) {
      return;
    }

    try {
      // Start the polling process
      const pollingPromise = this.authProvider.pollForTokens(
        this.currentDeviceCodeResponse.deviceCode
      );

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
   * Validate existing container or create new one
   * Called after successful authentication (either via tokens or device code)
   */
  private async validateOrCreateContainer(): Promise<void> {
    if (!this.currentContainerId) {
      this.logger?.info('No container ID - creating new container after authentication');

      const { HttpClient } = await import('../lib/http/HttpClient');
      const { ContainerManager } = await import('../lib/api/ContainerManager');

      const httpClient = new HttpClient({
        timeout: 30000,
        maxRetries: 3,
        rateLimit: {
          maxRequests: 50,
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
        },
      });

      // TODO: Cleanup this whole code construction is very dubious.
      // Now using simplified ContainerManager without storage abstraction

      const containerManager = new ContainerManager({
        httpClient,
        getAccessToken: async () => {
          if (!this.authProvider) {
            throw new Error('Auth provider not initialized');
          }
          return await this.authProvider.getValidAccessToken();
        },
        logger: this.logger,
      });

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
    } else {
      // User provided a container ID - validate it
      this.logger?.info(`Validating user-provided container ID: ${this.currentContainerId}`);

      const { HttpClient } = await import('../lib/http/HttpClient');
      const { ContainerManager } = await import('../lib/api/ContainerManager');
      const { ApiError } = await import('../lib/types/errors');

      const httpClient = new HttpClient({
        timeout: 30000,
        maxRetries: 3,
        rateLimit: {
          maxRequests: 50,
          windowMs: 24 * 60 * 60 * 1000,
        },
      });

      const containerManager = new ContainerManager({
        httpClient,
        getAccessToken: async () => {
          if (!this.authProvider) {
            throw new Error('Auth provider not initialized');
          }
          return await this.authProvider.getValidAccessToken();
        },
        logger: this.logger,
      });

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
  }

  /**
   * Update device store with new client ID and container ID
   * Triggers device reinitialization if values changed
   */
  private async updateDeviceStore(device: Device): Promise<void> {
    if (!this.currentClientId) {
      this.logger?.warn('No client ID to update in device store');
      return;
    }

    // Update device store with client ID and container ID (if changed)
    const currentClientId = device.getStoreValue('clientId') as string | undefined;
    const currentContainerId = device.getStoreValue('containerId') as string | undefined;

    if (
      currentClientId === this.currentClientId &&
      currentContainerId === this.currentContainerId
    ) {
      this.logger?.info('Device store already up to date - no changes needed');
    } else {
      this.logger?.info('Device store changed - updating...');

      // Update device store
      await device.setStoreValue('clientId', this.currentClientId);
      await device.setStoreValue('containerId', this.currentContainerId);
    }

    await device.setAvailable();

    // IMPORTANT: Store changes don't trigger lifecycle methods - must explicitly reinitialize
    this.logger?.info('Triggering device reinitialization after authentication change');
    // Type assertion since we know this is a Vehicle device
    const vehicleDevice = device as unknown as { reinitializeAfterAuth: () => Promise<void> };
    await vehicleDevice.reinitializeAfterAuth();
  }
}
