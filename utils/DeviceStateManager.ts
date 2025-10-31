/**
 * Device State Manager
 *
 * Manages persistence of vehicle state data using Homey's device store.
 * Implements a hybrid approach storing both raw telematic cache and aggregated VehicleStatus.
 *
 * This utility handles:
 * - Incremental MQTT updates (single telematic keys)
 * - Complete API updates (full VehicleStatus)
 * - Capability registration on app restart (from cached data)
 * - Transformation between telematic cache and VehicleStatus
 */

import type Homey from 'homey';
import type { VehicleStatus, TelematicDataPoint } from '../lib/models';
import type { StreamMessage } from '../lib/streaming';
import { TelematicDataTransformer } from '../lib/transformers/TelematicDataTransformer';
import type { ILogger } from '../lib/types/ILogger';
import { DriveTrainType } from '../lib/types/DriveTrainType';
import type { IVehicleClient } from '../lib/client/IVehicleClient';
import { DeviceSettings } from './DeviceSettings';
import type { LocationType } from './LocationType';

/**
 * Device store data structure
 *
 * Persisted in Homey device store for each vehicle device.
 */
export interface DeviceStoreData {
  /**
   * Unified telematic data cache (single source of truth)
   * Updated by both MQTT and API with timestamp-based merging
   * Key: Telematic key path (e.g., "vehicleStatus.mileage")
   * Value: Data point with timestamp, value, unit, source
   */
  telematicCache: Record<string, TelematicDataPoint>;

  /**
   * VIN (Vehicle Identification Number)
   * Stored for VehicleStatus construction
   */
  vin: string;

  /**
   * Drive train type (cached from API basic data)
   * Used for VehicleStatus transformation
   */
  driveTrain: DriveTrainType;

  /**
   * Timestamp of last API update (ISO 8601)
   */
  lastApiUpdate: string | null;

  /**
   * Timestamp of last MQTT message (ISO 8601)
   */
  lastMqttUpdate: string | null;
}

/**
 * Default empty device store data
 */
const DEFAULT_STORE_DATA: DeviceStoreData = {
  telematicCache: {},
  vin: '',
  driveTrain: 'UNKNOWN' as DriveTrainType,
  lastApiUpdate: null,
  lastMqttUpdate: null,
};

/**
 * Device State Manager
 *
 * Manages vehicle state persistence with hybrid telematic cache + VehicleStatus approach.
 * Provides clean API for MQTT streaming and API polling integration.
 *
 * @example
 * const stateManager = new DeviceStateManager(device, logger);
 *
 * // Update from MQTT message
 * const updatedStatus = await stateManager.updateFromMqttMessage(mqttMessage);
 * if (updatedStatus.currentMileage) {
 *   await device.setCapabilityValue('meter_mileage', updatedStatus.currentMileage);
 * }
 *
 * // Get cached status on app restart
 * const cachedStatus = await stateManager.getVehicleStatus();
 * if (cachedStatus) {
 *   await device.setCapabilityValue('meter_mileage', cachedStatus.currentMileage);
 * }
 */

export type StateUpdateDelegate = (status: VehicleStatus) => void | Promise<void>;

export class DeviceStateManager {
  private readonly device: Homey.Device;
  private readonly logger?: ILogger;
  private readonly storeKey = 'deviceState';

  // MQTT batching state
  private mqttBatchQueue: StreamMessage[] = [];
  private mqttBatchTimer: NodeJS.Timeout | null = null;

  // Delegate to notify on MQTT batch update
  private stateUpdateDelegate?: StateUpdateDelegate;

  /**
   * Creates a new DeviceStateManager instance
   *
   * @param device - Homey device instance for store access
   * @param logger - Optional logger for debugging
   */
  constructor(device: Homey.Device, logger?: ILogger, stateUpdateDelegate?: StateUpdateDelegate) {
    this.device = device;
    this.logger = logger;
    if (stateUpdateDelegate) {
      this.stateUpdateDelegate = stateUpdateDelegate;
    }
  }

  /**
   * Initializes the device store and optionally seeds cache from API
   *
   * Call this during device onInit() to ensure store exists.
   * If not already initialized:
   * 1. Fetches VehicleStatus to get VIN and drive train
   * 2. Initializes store with VIN and drive train
   * 3. If container ID provided, seeds cache with raw telematic data from API
   *
   * @param carDataClient - CarData API client for fetching data
   * @param vin - Vehicle Identification Number (device ID)
   * @param containerId - Optional container ID for telematic data (enables cache seeding)
   * @returns Promise resolving to VehicleStatus if cache was seeded, null otherwise
   */
  async initialize(
    carDataClient: IVehicleClient,
    vin: string,
    containerId?: string
  ): Promise<VehicleStatus | null> {
    const existing = this.loadStoreData();

    // Initialize store if not already initialized
    if (!existing.vin) {
      this.logger?.debug('Initializing device store - fetching VIN and drive train from API');

      const status = await carDataClient.getVehicleStatus(vin);

      await this.saveStoreData({
        ...DEFAULT_STORE_DATA,
        vin: status.vin,
        driveTrain: status.driveTrain,
      });

      this.logger?.info('Device store initialized', {
        vin: status.vin,
        driveTrain: status.driveTrain,
      });
    } else {
      this.logger?.debug('Device store already initialized', {
        vin: existing.vin,
        driveTrain: existing.driveTrain,
      });
    }

    // Seed cache if container ID provided (common path for both initialized and new stores)
    if (containerId) {
      await this.seedCacheFromApi(carDataClient, vin, containerId);
    }

    return this.getVehicleStatus();
  }

  /**
   * Seeds cache with raw telematic data from API
   *
   * Internal helper for cache initialization.
   * Only called if container ID exists and client supports raw telematic data.
   *
   * @param carDataClient - CarData API client
   * @param vin - Vehicle Identification Number
   * @param containerId - Container ID for telematic data
   * @returns Promise resolving to VehicleStatus
   * @private
   */
  private async seedCacheFromApi(
    carDataClient: IVehicleClient,
    vin: string,
    containerId: string
  ): Promise<void> {
    try {
      this.logger?.info(`Seeding cache from API for vehicle ${vin}`);

      // Get raw telematic data from API
      const rawData = await carDataClient.getRawTelematicData(vin, containerId);

      this.logger?.debug('Cache seed data from API', {
        keysCount: Object.keys(rawData).length,
        data: rawData,
      });

      // Update cache from raw telematic data
      await this.updateCacheFromTelematicData(rawData, 'api');

      this.logger?.info(
        `Cache seeded successfully with ${Object.keys(rawData).length} telematic keys`
      );
    } catch (error) {
      this.logger?.error(`Failed to seed cache from API for vehicle ${vin}`, error as Error);
    }
  }

  /**
   * Updates state from an MQTT stream message
   *
   * Performs:
   * 1. Updates telematic cache with new data point(s)
   * 2. Transforms cache to VehicleStatus
   * 3. Persists updated cache and status
   * 4. Returns updated VehicleStatus
   *
   * @param message - MQTT stream message with telematic data
   * @returns Updated VehicleStatus with new values
   */
  /**
   * Batches MQTT messages for 1 second before updating state.
   * All messages received within 1s are merged and processed together.
   */
  updateFromMqttMessage(message: StreamMessage): VehicleStatus {
    // Add message to batch queue
    this.mqttBatchQueue.push(message);

    // If timer is not running, start it (not using nullish coalescing
    // assignment as TS compiler complains about not using this.mqttBatchTimer)
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (!this.mqttBatchTimer) {
      this.mqttBatchTimer = setTimeout(() => {
        // Robust local swap: atomically swap out the queue reference
        const batch = this.mqttBatchQueue;
        this.mqttBatchQueue = [];
        this.mqttBatchTimer = null;

        // Merge all data points from all messages (last one wins per key within batch)
        const mergedData: Record<string, TelematicDataPoint> = {};
        let vin = '';
        for (const msg of batch) {
          vin = msg.vin; // All messages should be for the same VIN
          Object.assign(mergedData, msg.data);
        }

        this.logger?.info('Batch updating state from MQTT messages', {
          vin,
          batchCount: batch.length,
          keysCount: Object.keys(mergedData).length,
        });

        // Wrap in void to ignore returned promise
        void (async () => {
          // Update cache using shared method
          await this.updateCacheFromTelematicData(mergedData, 'mqtt');

          // Load updated state for transformation
          const storeData = this.loadStoreData();

          // Transform unified cache to VehicleStatus (always computed from cache)
          const updatedStatus = this.transformCacheToStatus(storeData);

          this.logger?.debug('State updated from MQTT (batched)', {
            lastUpdated: updatedStatus.lastUpdatedAt,
            batchCount: batch.length,
          });

          // Invoke delegate if set
          if (this.stateUpdateDelegate) {
            try {
              await this.stateUpdateDelegate(updatedStatus);
            } catch (err) {
              this.logger?.warn('State update delegate threw error', { error: err });
            }
          }
        })();
      }, 1000);
    }

    // Return last known status immediately (may not include this message yet)
    return this.getVehicleStatus() ?? ({} as VehicleStatus);
  }

  /**
   * Updates state from API polling data
   *
   * Public method for API polling to update cache with fresh telematic data.
   * Uses timestamp-based merging to ensure newest values win.
   *
   * @param telematicData - Raw telematic data from API
   * @returns Updated VehicleStatus after cache update
   *
   * @example
   * ```typescript
   * const rawData = await apiClient.getRawTelematicData(vin, containerId);
   * const updatedStatus = await stateManager.updateFromApi(rawData);
   * ```
   */
  async updateFromApi(telematicData: Record<string, TelematicDataPoint>): Promise<VehicleStatus> {
    // Update cache using shared method
    await this.updateCacheFromTelematicData(telematicData, 'api');

    // Load updated state for transformation
    const storeData = this.loadStoreData();

    // Transform unified cache to VehicleStatus
    const updatedStatus = this.transformCacheToStatus(storeData);

    this.logger?.debug('State updated from API', {
      lastUpdated: updatedStatus.lastUpdatedAt,
    });

    // Invoke delegate if set
    if (this.stateUpdateDelegate) {
      try {
        await this.stateUpdateDelegate(updatedStatus);
      } catch (err) {
        this.logger?.warn('State update delegate threw error', { error: err });
      }
    }

    return updatedStatus;
  }

  /**
   * Updates cache from telematic data with timestamp-based merging
   *
   * Shared method for both MQTT and API updates.
   * Only updates cache if incoming data is newer than existing data.
   *
   * @param telematicData - Raw telematic data
   * @param source - Data source for logging ('mqtt' | 'api')
   * @private
   */
  private async updateCacheFromTelematicData(
    telematicData: Record<string, TelematicDataPoint>,
    source: 'mqtt' | 'api'
  ): Promise<void> {
    this.logger?.info(`Updating cache from ${source.toUpperCase()} telematic data`, {
      keysCount: Object.keys(telematicData).length,
    });
    this.logger?.debug(`Processing the following ${source.toUpperCase()} telematic data`, {
      data: telematicData,
    });

    const storeData = this.loadStoreData();

    // Update cache with timestamp-based merging
    // Only update if newer OR doesn't exist
    for (const [key, dataPoint] of Object.entries(telematicData)) {
      const existing = storeData.telematicCache[key];
      const incomingTimestamp = new Date(dataPoint.timestamp);
      const existingTimestamp = existing ? new Date(existing.timestamp) : null;

      if (!existingTimestamp || incomingTimestamp >= existingTimestamp) {
        storeData.telematicCache[key] = dataPoint;
      }
    }

    // Update last update timestamp
    if (source === 'api') {
      storeData.lastApiUpdate = new Date().toISOString();
    } else {
      storeData.lastMqttUpdate = new Date().toISOString();
    }

    await this.saveStoreData(storeData);

    this.logger?.debug('Updated telematic cache', { data: storeData.telematicCache });
    this.logger?.info(`Cache updated from ${source.toUpperCase()} telematic data`, {
      cacheSize: Object.keys(storeData.telematicCache).length,
    });
  }

  /**
   * Retrieves the last known vehicle status
   *
   * Computed from unified cache (single source of truth).
   * Used for capability registration on app restart.
   *
   * @returns Cached VehicleStatus or null
   */
  getVehicleStatus(): VehicleStatus | null {
    const storeData = this.loadStoreData();
    if (!storeData.vin) {
      return null; // Not initialized yet
    }
    return this.transformCacheToStatus(storeData);
  }

  /**
   * Retrieves a specific telematic value by key
   *
   * @param key - Telematic key path (e.g., "vehicleStatus.mileage")
   * @returns Data point or undefined if not found
   */
  getTelematicValue(key: string): TelematicDataPoint | undefined {
    const storeData = this.loadStoreData();
    return storeData.telematicCache[key];
  }

  /**
   * Retrieves all telematic cache data
   *
   * Useful for debugging or bulk operations.
   *
   * @returns Complete telematic cache
   */
  getTelematicCache(): Record<string, TelematicDataPoint> {
    const storeData = this.loadStoreData();
    return storeData.telematicCache;
  }

  /**
   * Gets metadata about last updates
   *
   * @returns Object with last API and MQTT update timestamps
   */
  getUpdateMetadata(): {
    lastApiUpdate: string | null;
    lastMqttUpdate: string | null;
  } {
    const storeData = this.loadStoreData();
    return {
      lastApiUpdate: storeData.lastApiUpdate,
      lastMqttUpdate: storeData.lastMqttUpdate,
    };
  }

  /**
   * Checks if streaming is enabled
   *
   * Reads from device settings (user preference in UI).
   *
   * @returns True if streaming enabled
   */
  isStreamingEnabled(): boolean {
    const settings = this.device.getSettings() as DeviceSettings;
    return settings.streamingEnabled ?? true; // Default to true if not set
  }

  /**
   * Clears all cached data
   *
   * Useful when re-pairing a device or resetting state.
   * Preserves VIN and drive train.
   */
  async clearCache(): Promise<void> {
    this.logger?.info('Clearing device state cache');
    const storeData = this.loadStoreData();
    await this.saveStoreData({
      ...DEFAULT_STORE_DATA,
      vin: storeData.vin,
      driveTrain: storeData.driveTrain,
    });
  }

  /**
   * Transforms telematic cache to VehicleStatus
   *
   * Uses TelematicDataTransformer to convert raw telematic data
   * to generic VehicleStatus model. Always computed from unified cache.
   *
   * @param storeData - Device store data with cache, VIN, and drive train
   * @returns Transformed VehicleStatus
   * @private
   */
  private transformCacheToStatus(storeData: DeviceStoreData): VehicleStatus {
    // Transform telematic data to VehicleStatus
    const transformed = TelematicDataTransformer.transform(
      storeData.vin,
      storeData.driveTrain,
      storeData.telematicCache
    );

    // Return transformed status
    // No merging needed - cache is single source of truth
    // Transformer already includes vin, driveTrain, and lastUpdatedAt
    return transformed;
  }

  /**
   * Loads device store data
   *
   * @returns Device store data or default if not found
   * @private
   */
  private loadStoreData(): DeviceStoreData {
    try {
      const data = this.device.getStoreValue(this.storeKey) as DeviceStoreData | undefined;

      if (!data) {
        return { ...DEFAULT_STORE_DATA };
      }

      return data;
    } catch (error) {
      this.logger?.warn('Failed to load device store data, using defaults', { error });
      return { ...DEFAULT_STORE_DATA };
    }
  }

  /**
   * Saves device store data
   *
   * @param data - Device store data to save
   * @private
   */
  private async saveStoreData(data: DeviceStoreData): Promise<void> {
    try {
      await this.device.setStoreValue(this.storeKey, data);
    } catch (error) {
      this.logger?.error('Failed to save device store data', error as Error, {
        vin: data.vin,
      });
      throw error;
    }
  }

  /**
   * Get last trip complete location (persisted)
   *
   * @returns Last trip complete location or default empty location if not set
   */
  getLastTripCompleteLocation(): LocationType {
    const stored = this.device.getStoreValue('lastTripCompleteLocation') as
      | LocationType
      | undefined;
    return (
      stored ?? {
        label: '',
        latitude: 0,
        longitude: 0,
        address: '',
      }
    );
  }

  /**
   * Set last trip complete location (persists to store)
   *
   * @param location - Location to persist
   */
  async setLastTripCompleteLocation(location: LocationType): Promise<void> {
    await this.device.setStoreValue('lastTripCompleteLocation', location);
    this.logger?.debug('Persisted last trip complete location', { location });
  }

  /**
   * Get last trip complete mileage (persisted)
   *
   * @returns Last trip complete mileage or 0 if not set
   */
  getLastTripCompleteMileage(): number {
    const stored = this.device.getStoreValue('lastTripCompleteMileage') as number | undefined;
    return stored ?? 0;
  }

  /**
   * Set last trip complete mileage (persists to store)
   *
   * @param mileage - Mileage to persist
   */
  async setLastTripCompleteMileage(mileage: number): Promise<void> {
    await this.device.setStoreValue('lastTripCompleteMileage', mileage);
    this.logger?.debug('Persisted last trip complete mileage', { mileage });
  }

  /**
   * Get last known location (persisted, Homey LocationType format)
   *
   * Returns the last known location in Homey's LocationType format with label, address, etc.
   * This is updated whenever the location changes and includes geofence information.
   *
   * @returns Last known location or undefined if not set
   */
  getLastLocation(): LocationType | undefined {
    const stored = this.device.getStoreValue('lastLocation') as LocationType | undefined;
    return stored;
  }

  /**
   * Set last known location (persists to store, Homey LocationType format)
   *
   * Stores the location with label, address, and other Homey-specific fields.
   *
   * @param location - Location to persist
   */
  async setLastLocation(location: LocationType): Promise<void> {
    await this.device.setStoreValue('lastLocation', location);
    this.logger?.debug('Persisted last location', { location });
  }
}
