import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import Homey from 'homey';
import { ConfigurationManager } from './utils/ConfigurationManager';
import { ILogger, LogLevel } from './lib';
import { Configuration } from './utils/Configuration';
import { LocationType } from './utils/LocationType';
import * as semver from 'semver';
import { ArgumentAutocompleteResults } from 'homey/lib/FlowCard';
import { Capabilities } from './utils/Capabilities';
import { LokiLogger } from './utils/LokiLogger';
import { Logger } from './utils/Logger';
import { DeviceCodeAuthProvider } from './lib/auth/DeviceCodeAuthProvider';
import { CarDataClient } from './lib/api/CarDataClient';
import { HttpClient } from './lib/http/HttpClient';
import { HomeyTokenStore } from './utils/HomeyTokenStore';

// TODO:
// Window states capability
// Hood state capability
// Trunk state capability

/**
 * BMW Connected Drive app for Homey
 *
 * Manages authentication providers and API clients per client ID (GCID).
 * Multiple vehicles can share the same auth provider and API client if they
 * use the same client ID.
 */
export class BMWConnectedDrive extends Homey.App {
  logger?: ILogger;
  currentLocation?: LocationType;

  // Client managers for shared authentication and API clients
  private authProviders: Map<string, DeviceCodeAuthProvider> = new Map();
  private apiClients: Map<string, CarDataClient> = new Map();
  private tokenStore?: HomeyTokenStore;

  /**
   * Get or create authentication provider for a client ID
   *
   * @param clientId - BMW CarData API client ID (UUID)
   * @returns DeviceCodeAuthProvider instance
   */
  getAuthProvider(clientId: string): DeviceCodeAuthProvider {
    const existing = this.authProviders.get(clientId);
    if (existing) {
      return existing;
    }

    this.logger?.info(`[ClientAuthManager] Creating new auth provider for client ID: ${clientId}`);

    if (!this.tokenStore) {
      throw new Error('Token store not initialized');
    }

    const authProvider = new DeviceCodeAuthProvider(this.tokenStore, clientId, {
      logger: this.logger,
    });

    this.authProviders.set(clientId, authProvider);
    return authProvider;
  }

  /**
   * Get or create API client for a client ID
   *
   * @param clientId - BMW CarData API client ID (UUID)
   * @returns CarDataClient instance
   */
  getApiClient(clientId: string): CarDataClient {
    const existing = this.apiClients.get(clientId);
    if (existing) {
      return existing;
    }

    this.logger?.info(`[ClientApiManager] Creating new API client for client ID: ${clientId}`);

    const authProvider = this.getAuthProvider(clientId);

    // Create HTTP client with rate limiting (50 requests per 24 hours)
    const httpClient = new HttpClient({
      timeout: 30000,
      maxRetries: 3,
      rateLimit: {
        maxRequests: 50,
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
      },
      logger: this.logger,
    });

    const apiClient = new CarDataClient({
      authProvider,
      httpClient,
      logger: this.logger,
    });
    this.apiClients.set(clientId, apiClient);
    return apiClient;
  }

  /**
   * Remove cached auth provider and API client for a client ID
   * Used when user changes client ID or logs out
   *
   * @param clientId - BMW CarData API client ID (UUID)
   */
  clearClientCache(clientId: string): void {
    this.logger?.info(`[ClientManager] Clearing cache for client ID: ${clientId}`);

    const apiClient = this.apiClients.get(clientId);
    if (apiClient) {
      // Disconnect API client (revokes tokens)
      void apiClient.disconnect();
    }

    this.authProviders.delete(clientId);
    this.apiClients.delete(clientId);
  }

  /**
   * onInit is called when the app is initialized.
   */
  async onInit(): Promise<void> {
    // Load configuration first to determine logger type
    let configuration = ConfigurationManager.getConfiguration(this.homey);
    if (!configuration) {
      configuration = new Configuration();
      ConfigurationManager.setConfiguration(this.homey, configuration);
    } else {
      await this.migrate_configuration();
    }

    // Initialize logger based on configuration
    // If Loki URL is provided, use LokiLogger; otherwise use standard Logger
    if (configuration.lokiUrl && configuration.lokiUrl.trim() !== '') {
      this.logger = new LokiLogger(this.homey, configuration.lokiUrl, () =>
        configuration.logEnabled ? configuration.logLevel : LogLevel.ERROR
      );
      this.logger.info(`Initialized with Loki logger at ${configuration.lokiUrl}`);
    } else {
      this.logger = new Logger(this.homey, () =>
        configuration.logEnabled ? configuration.logLevel : LogLevel.ERROR
      );
      this.logger.info('Initialized with standard logger');
    }

    // Initialize app-level token store
    this.tokenStore = new HomeyTokenStore(this.homey, this.logger);

    // Note: Auth providers and API clients are created on-demand per client ID
    // Devices call getAuthProvider() and getApiClient() to get shared instances

    this.logger.info('BMWConnectedDrive app has been initialized');

    // Register condition cards only (read-only)
    // All action cards for remote services have been removed due to BMW CarData API limitations
    this.registerConditionCards();
  }

  private registerConditionCards() {
    const geofenceCard = this.homey.flow.getConditionCard('geofence');
    geofenceCard.registerArgumentAutocompleteListener(
      'geo_fence',
      async (query: string, _args: any): Promise<ArgumentAutocompleteResults> => {
        const configuration = ConfigurationManager.getConfiguration(this.homey);
        if (configuration?.geofences) {
          const geofences = configuration.geofences.map((item) => ({
            name: item.label ?? 'Unnamed',
            id: item.label ?? 'Unnamed',
          }));
          return geofences.filter((result) =>
            result.name?.toLowerCase().includes(query.toLowerCase())
          );
        }

        return [];
      }
    );
    // TODO: This is currently app level, need to improve this, either the currentLocation needs to be multi device or we need to move this to device level
    geofenceCard.registerRunListener(async (args: any, _state: any) => {
      const app = this.homey.app as BMWConnectedDrive;
      return (
        app.currentLocation && args.geo_fence.id && app.currentLocation.label === args.geo_fence.id
      );
    });

    this.homey.flow
      .getConditionCard('battery_percentage')
      .registerRunListener(async (args: any, _: any) => {
        const battery_percentage = await Capabilities.GetCapabilityValueSafe<number>(
          args.device,
          'measure_battery'
        );
        return battery_percentage && battery_percentage < args.battery_charge_test;
      });

    this.homey.flow
      .getConditionCard('charging_status')
      .registerRunListener(async (args: any, _: any) => {
        const charging_state = await Capabilities.GetCapabilityValueSafe<string>(
          args.device,
          'charging_status_capability'
        );
        return charging_state === args.charging_state;
      });
  }

  /**
   * Perform migrations to ensure proper functionality after upgrading
   */
  private async migrate_configuration() {
    const configuration = ConfigurationManager.getConfiguration(this.homey);
    this.logger?.info(`Configuration version is ${configuration.currentVersion}.`);

    if (!configuration.currentVersion) {
      configuration.currentVersion = '0.0.0';
    }

    await this.migrate_0_6_5(configuration);
    await this.migrate_0_7_0(configuration);
    await this.migrate_1_0_0(configuration);

    configuration.currentVersion = this.homey.app.manifest.version;
    ConfigurationManager.setConfiguration(this.homey, configuration);
  }

  /**
   * Migrate configuration from earlier version to 0.6.5
   */
  private async migrate_0_6_5(configuration: Configuration) {
    if (semver.lt(configuration.currentVersion, '0.6.5')) {
      this.logger?.info('Migrating to version 0.6.5');

      // Migrating geofences properties to the new casing
      if (configuration.geofences) {
        configuration.geofences = (configuration.geofences as any[]).map((fence) => {
          return {
            label: fence.Label,
            latitude: fence.Latitude,
            longitude: fence.Longitude,
            address: fence.Address,
            radius: fence.Radius,
          };
        });
      }
    }
  }

  /**
   * Migrate configuration from earlier version to 0.7.0
   */
  private async migrate_0_7_0(configuration: Configuration) {
    if (semver.lt(configuration.currentVersion, '0.7.0')) {
      this.logger?.info('Migrating to version 0.7.0');

      // Removing username, password and captcha from the configuration
      // as they are no longer persisted in the application.
      delete (configuration as any).username;
      delete (configuration as any).password;
      delete (configuration as any).captcha;
    }
  }

  /**
   * Migrate configuration from earlier version to 1.0.0 (BMW CarData API migration)
   */
  private async migrate_1_0_0(configuration: Configuration) {
    if (semver.lt(configuration.currentVersion, '1.0.0')) {
      this.logger?.info('Migrating to version 1.0.0 (BMW CarData API)');

      // Remove client ID from app-level configuration
      // Client ID is now stored per-device in device settings
      if ((configuration as any).clientId) {
        this.logger?.info('Removing app-level clientId (now per-device)');
        delete (configuration as any).clientId;
      }

      // Note: Existing devices will need repair to populate clientId in device settings
      // The HomeyTokenStore already migrated to app-level storage with clientId keys
    }
  }
}

module.exports = BMWConnectedDrive;
