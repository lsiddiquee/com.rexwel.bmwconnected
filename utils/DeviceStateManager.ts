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
import type { LocationType } from './LocationType';
import { STORE_KEY_DEVICE_STATE, STORE_KEY_CLIENT_ID, STORE_KEY_CONTAINER_ID } from './StoreKeys';

/**
 * Device store data structure
 *
 * Persisted in Homey device store for each vehicle device.
 * Includes all data managed by DeviceStateManager except auth credentials (clientId/containerId).
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
  lastApiUpdate?: string;

  /**
   * Timestamp of last MQTT message (ISO 8601)
   */
  lastMqttUpdate?: string;

  /**
   * Last trip completion location (where previous trip ended)
   */
  lastTripCompleteLocation?: LocationType;

  /**
   * Last trip completion mileage (where previous trip ended)
   */
  lastTripCompleteMileage?: number;

  /**
   * Last known location with geofence info (Homey LocationType format)
   * Updated on every location change (no threshold)
   */
  lastLocation?: LocationType;

  /**
   * Location when flow cards were last triggered
   * Only updated when location flows trigger (distance threshold or geofence change)
   * Used to accumulate distance correctly for flow trigger logic
   */
  lastFlowTriggeredLocation?: LocationType;

  /**
   * Whether vehicle is currently driving
   * Set to true when drive starts (first significant location change)
   * Set to false when trip completes (TRIP category messages stop)
   * Persists across app restarts for better UX during long drives
   */
  isDriving?: boolean;
}

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
  private readonly vin: string;
  private readonly device: Homey.Device;
  private readonly logger?: ILogger;

  // MQTT batching state
  private mqttBatchQueue: StreamMessage[] = [];
  private mqttBatchTimer: NodeJS.Timeout | null = null;

  // Delegate to notify on MQTT batch update
  private stateUpdateDelegate: StateUpdateDelegate;

  private static readonly MQTT_BATCH_WINDOWS_MS = 1000; // 1 second

  /**
   * Creates a new DeviceStateManager instance
   *
   * @param device - Homey device instance for store access
   * @param vin - Vehicle Identification Number (device ID)
   * @param logger - Optional logger for debugging
   */
  constructor(
    device: Homey.Device,
    vin: string,
    stateUpdateDelegate: StateUpdateDelegate,
    logger?: ILogger
  ) {
    this.device = device;
    this.vin = vin;
    this.logger = logger;
    this.stateUpdateDelegate = stateUpdateDelegate;
    let deviceState = this.device.getStoreValue(STORE_KEY_DEVICE_STATE) as
      | DeviceStoreData
      | undefined;
    if (!deviceState) {
      deviceState = {
        telematicCache: {},
        vin: vin,
        driveTrain: DriveTrainType.UNKNOWN,
      };
      void this.saveStoreData(deviceState);
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
  updateFromMqttMessage(message: StreamMessage): void {
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
        for (const msg of batch) {
          this.mergeTelematicData(mergedData, msg.data);
        }

        this.logger?.info('Batch processing MQTT messages', {
          vin: this.vin,
          batchCount: batch.length,
          keysCount: Object.keys(mergedData).length,
        });

        // Wrap in void to ignore returned promise
        void (async () => {
          // Update cache using shared method
          await this.updateCacheFromTelematicData(mergedData, 'mqtt');

          // Transform unified cache to VehicleStatus (always computed from cache)
          const updatedStatus = this.transformCacheToStatus();

          this.logger?.debug('State updated from MQTT (batched)', {
            lastUpdated: updatedStatus.lastUpdatedAt,
            batchCount: batch.length,
          });

          // Invoke delegate if set
          try {
            await this.stateUpdateDelegate(updatedStatus);
          } catch (err) {
            this.logger?.warn('State update delegate threw error', { error: err });
          }
        })();
      }, DeviceStateManager.MQTT_BATCH_WINDOWS_MS);
    }
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

    // Transform unified cache to VehicleStatus
    const updatedStatus = this.transformCacheToStatus();

    this.logger?.debug('State updated from API', {
      lastUpdated: updatedStatus.lastUpdatedAt,
    });

    // Invoke delegate if set
    try {
      await this.stateUpdateDelegate(updatedStatus);
    } catch (err) {
      this.logger?.warn('State update delegate threw error', { error: err });
    }

    return updatedStatus;
  }

  /**
   * Merges telematic data with timestamp-based comparison
   *
   * Merges source telematic data into target cache, only updating keys where
   * source data is newer than target data (or target doesn't exist).
   *
   * @param target - Target cache to merge into (modified in-place)
   * @param source - Source telematic data to merge from (read-only)
   * @returns Number of keys updated in target
   * @private
   */
  private mergeTelematicData(
    target: Record<string, TelematicDataPoint>,
    source: Record<string, TelematicDataPoint>
  ): number {
    let updatedCount = 0;

    // Merge with timestamp-based comparison
    // Only update if source is newer OR target doesn't exist
    for (const [key, sourceDataPoint] of Object.entries(source)) {
      const targetDataPoint = target[key];
      const sourceTimestamp = new Date(sourceDataPoint.timestamp);
      const targetTimestamp = targetDataPoint ? new Date(targetDataPoint.timestamp) : null;

      if (!targetTimestamp || sourceTimestamp >= targetTimestamp) {
        target[key] = sourceDataPoint;
        updatedCount++;
      }
    }

    return updatedCount;
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

    const updatedCount = this.mergeTelematicData(storeData.telematicCache, telematicData);

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
      updatedKeys: updatedCount,
    });
  }

  /**
   * Retrieves the last known vehicle status
   *
   * Computed from unified cache (single source of truth).
   * Used for capability registration on app restart.
   *
   * @returns Cached VehicleStatus
   * @throws Error if state manager not initialized (call initialize() first)
   */
  getVehicleStatus(): VehicleStatus {
    return this.transformCacheToStatus();
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
      telematicCache: {},
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
  private transformCacheToStatus(): VehicleStatus {
    const storeData = this.loadStoreData();

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
    const data = this.device.getStoreValue(STORE_KEY_DEVICE_STATE) as DeviceStoreData | undefined;

    if (!data) {
      throw new Error('Device store data not found - DeviceStateManager not initialized');
    }

    return data;
  }

  /**
   * Saves device store data
   *
   * @param data - Device store data to save
   * @private
   */
  private async saveStoreData(data: DeviceStoreData): Promise<void> {
    try {
      await this.device.setStoreValue(STORE_KEY_DEVICE_STATE, data);
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
   * @returns Last trip complete location or undefined if not set
   */
  getLastTripCompleteLocation(): LocationType | undefined {
    const storeData = this.loadStoreData();
    return storeData.lastTripCompleteLocation;
  }

  /**
   * Set last trip complete location (persists to store)
   *
   * @param location - Location to persist
   */
  async setLastTripCompleteLocation(location: LocationType): Promise<void> {
    const storeData = this.loadStoreData();
    storeData.lastTripCompleteLocation = location;
    await this.saveStoreData(storeData);
    this.logger?.debug('Persisted last trip complete location', { location });
  }

  /**
   * Get last trip complete mileage (persisted)
   *
   * @returns Last trip complete mileage or undefined if not set
   */
  getLastTripCompleteMileage(): number | undefined {
    const storeData = this.loadStoreData();
    return storeData.lastTripCompleteMileage;
  }

  /**
   * Set last trip complete mileage (persists to store)
   *
   * @param mileage - Mileage to persist
   */
  async setLastTripCompleteMileage(mileage: number): Promise<void> {
    const storeData = this.loadStoreData();
    storeData.lastTripCompleteMileage = mileage;
    await this.saveStoreData(storeData);
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
    const storeData = this.loadStoreData();
    return storeData.lastLocation;
  }

  /**
   * Set last known location (persists to store, Homey LocationType format)
   *
   * Stores the location with label, address, and other Homey-specific fields.
   *
   * @param location - Location to persist
   */
  async setLastLocation(location: LocationType): Promise<void> {
    const storeData = this.loadStoreData();
    storeData.lastLocation = location;
    await this.saveStoreData(storeData);
    this.logger?.debug('Persisted last location', { location });
  }

  /**
   * Get last flow triggered location (persisted)
   *
   * Returns the location when flow cards were last triggered.
   * Used to accumulate distance correctly for flow trigger logic.
   *
   * @returns Last flow triggered location or undefined if not set
   */
  getLastFlowTriggeredLocation(): LocationType | undefined {
    const storeData = this.loadStoreData();
    return storeData.lastFlowTriggeredLocation;
  }

  /**
   * Set last flow triggered location (persists to store)
   *
   * Updates the marker for where flow cards were last triggered.
   *
   * @param location - Location to persist
   */
  async setLastFlowTriggeredLocation(location: LocationType): Promise<void> {
    const storeData = this.loadStoreData();
    storeData.lastFlowTriggeredLocation = location;
    await this.saveStoreData(storeData);
    this.logger?.debug('Persisted last flow triggered location', { location });
  }

  /**
   * Get driving state
   *
   * Returns whether vehicle is currently driving (between drive start and trip completion).
   *
   * @returns True if driving, false if stopped, undefined if never set
   */
  getIsDriving(): boolean | undefined {
    const storeData = this.loadStoreData();
    return storeData.isDriving;
  }

  /**
   * Set driving state (persists to store)
   *
   * Updates whether vehicle is currently driving.
   * Set to true on drive start, false on trip completion.
   * Persists across app restarts for better UX during long drives.
   *
   * @param isDriving - True if driving, false if stopped
   */
  async setIsDriving(isDriving: boolean): Promise<void> {
    const storeData = this.loadStoreData();
    storeData.isDriving = isDriving;
    await this.saveStoreData(storeData);
    this.logger?.debug('Persisted driving state', { isDriving });
  }

  /**
   * Get last trip completion location from state
   *
   * @returns Client ID or undefined if not set
   */
  getClientId(): string | undefined {
    const stored = this.device.getStoreValue(STORE_KEY_CLIENT_ID) as string | undefined;
    return stored;
  }

  /**
   * Set client ID for BMW CarData API authentication (persists to store)
   *
   * @param clientId - Client ID to persist
   */
  async setClientId(clientId: string): Promise<void> {
    await this.device.setStoreValue(STORE_KEY_CLIENT_ID, clientId);
    this.logger?.debug('Persisted client ID', { clientId: clientId.substring(0, 8) + '...' });
  }

  /**
   * Get container ID for BMW CarData API telematic data access (persisted)
   *
   * @returns Container ID or undefined if not set
   */
  getContainerId(): string | undefined {
    const stored = this.device.getStoreValue(STORE_KEY_CONTAINER_ID) as string | undefined;
    return stored;
  }

  /**
   * Set container ID for BMW CarData API telematic data access (persists to store)
   *
   * @param containerId - Container ID to persist
   */
  async setContainerId(containerId: string): Promise<void> {
    await this.device.setStoreValue(STORE_KEY_CONTAINER_ID, containerId);
    this.logger?.debug('Persisted container ID', { containerId });
  }

  /**
   * Get vehicle drive train type for capability migration (persisted)
   *
   * @returns Drive train type or undefined if not set
   */
  getDriveTrain(): DriveTrainType {
    const storeData = this.loadStoreData();
    return storeData.driveTrain;
  }

  /**
   * Set vehicle drive train type for capability migration (persists to store)
   *
   * @param driveTrain - Drive train type to persist
   */
  async setDriveTrain(driveTrain: DriveTrainType): Promise<void> {
    const storeData = this.loadStoreData();
    storeData.driveTrain = driveTrain;
    await this.saveStoreData(storeData);
    this.logger?.debug('Persisted drive train', { driveTrain });
  }
}
