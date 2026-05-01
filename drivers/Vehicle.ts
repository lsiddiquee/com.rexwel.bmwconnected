import * as geo from 'geolocation-utils';
import { Device } from 'homey';
import * as semver from 'semver';
import { BMWConnectedDrive } from '../app';
import { Capabilities } from '../utils/Capabilities';
import { ConfigurationManager } from '../utils/ConfigurationManager';
import { DeviceData } from '../utils/DeviceData';
import { LocationType } from '../utils/LocationType';
import { ILogger } from '../lib';
import { DeviceSettings } from '../utils/DeviceSettings';
import { nameOf } from '../utils/Utils';
import type { IVehicleClient } from '../lib/client/IVehicleClient';
import type { VehicleStatus } from '../lib/models/VehicleStatus';
import { DeviceCodeAuthProvider } from '../lib/auth/DeviceCodeAuthProvider';
import { MqttStreamClient } from '../lib/streaming/MqttStreamClient';
import type { StreamMessage } from '../lib/streaming/StreamMessage';
import { DeviceStateManager } from '../utils/DeviceStateManager';
import {
  HV_BATTERY_DRIVE_TRAINS,
  COMBUSTION_ENGINE_DRIVE_TRAINS,
  DriveTrainType,
} from '../lib/types/DriveTrainType';
import { UnitConverter } from '../utils/UnitConverter';
import { Flows } from '../utils/Flows';

export class Vehicle extends Device {
  currentVehicleState: VehicleStatus | null = null;

  protected get app(): BMWConnectedDrive {
    return this.homey.app as BMWConnectedDrive;
  }

  protected get logger(): ILogger | undefined {
    return this.app.logger;
  }

  protected get deviceData(): DeviceData {
    return this.getData() as DeviceData;
  }

  protected get settings(): DeviceSettings {
    return this.getSettings() as DeviceSettings;
  }

  // Per-device CarData API client
  private _carDataClient?: IVehicleClient;

  // MQTT streaming client for real-time updates
  private _mqttClient?: MqttStreamClient;

  // Device state manager for persistence (required - init fails if unavailable)
  // Public to allow ConnectedDriver to access for repair/pairing operations
  public stateManager!: DeviceStateManager;

  // Auth provider (needed for MQTT authentication)
  private _authProvider?: DeviceCodeAuthProvider;

  // API polling timer for periodic state updates
  private _apiPollingTimer?: NodeJS.Timeout;

  // Trip session debouncing
  private _tripDebounceTimer?: NodeJS.Timeout;
  private static readonly TRIP_DEBOUNCE_WINDOW_MS = 5000; // 5 seconds - allow time for final location updates
  private static readonly LOCATION_CHANGE_THRESHOLD_METERS = 50; // 50 meters - significant location change to consider location update

  // Cached TRIP category keys for efficient filtering
  private static _tripCategoryKeys?: Set<string>;

  get api(): IVehicleClient | undefined {
    return this._carDataClient;
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.logger?.info(`Initializing BMW vehicle device: ${this.getName()} (${this.deviceData.id})`);

    this.stateManager = new DeviceStateManager(
      this,
      this.deviceData.id,
      this.updateCapabilitiesFromStatus.bind(this),
      this.logger
    );

    // Load persisted settings before starting any services so we respect user preferences
    await this.migrate_device_settings();

    // Initialize vehicle data and services (API client, state manager, MQTT, API polling)
    await this.initializeVehicleDataAndServices();

    this.currentVehicleState = this.stateManager.getVehicleStatus();
    if (this.stateManager.getDriveTrain() === DriveTrainType.UNKNOWN) {
      if (this.currentVehicleState.driveTrain !== DriveTrainType.UNKNOWN) {
        await this.stateManager.setDriveTrain(this.currentVehicleState.driveTrain);
      } else if (this.api) {
        const status = await this.api.getVehicleStatus(this.deviceData.id);
        await this.stateManager.setDriveTrain(status.driveTrain);
      }
    }

    // Initialize last location if not set
    let lastLocation = this.stateManager.getLastLocation();
    if (!lastLocation && this.currentVehicleState.location) {
      lastLocation = {
        label: '',
        latitude: this.currentVehicleState.location.coordinates.latitude,
        longitude: this.currentVehicleState.location.coordinates.longitude,
        address: this.currentVehicleState.location.address?.formatted ?? '',
      };

      // Check geofence to set label and address if configured, resolve via OpenStreetMap if needed
      await this.checkGeofence(lastLocation, true);

      await this.stateManager.setLastLocation(lastLocation);
    }

    // Initialize flow trigger location independently (needed for two-location tracking)
    // This ensures upgraded devices get this property initialized
    const lastFlowLocation = this.stateManager.getLastFlowTriggeredLocation();
    if (!lastFlowLocation && lastLocation) {
      await this.stateManager.setLastFlowTriggeredLocation(lastLocation);
    }

    // Initialize trip tracking independently (needed for drive session tracking)
    // This ensures upgraded devices get these properties initialized
    const lastTripLocation = this.stateManager.getLastTripCompleteLocation();
    if (!lastTripLocation && lastLocation) {
      await this.stateManager.setLastTripCompleteLocation(lastLocation);
    }

    const lastTripMileage = this.stateManager.getLastTripCompleteMileage();
    if (lastTripMileage === undefined && this.currentVehicleState?.currentMileage) {
      await this.stateManager.setLastTripCompleteMileage(this.currentVehicleState.currentMileage);
    }

    await this.migrate_device_capabilities();

    this.logger?.info(`${this.getName()} (${this.deviceData.id}) has been initialized`);
    this.logger?.debug('Initialized device cache state', { data: this.currentVehicleState });
  }

  /**
   * Initialize per-device CarData API client
   * Gets shared client from app based on device's client ID
   */
  private async initializeCarDataClient(): Promise<void> {
    try {
      await Promise.resolve();

      // Get client ID from state manager (persistent, dynamic storage)
      const clientId = this.stateManager.getClientId();

      if (!clientId || typeof clientId !== 'string') {
        this.logger?.warn(
          'No client ID found in device store - authentication required via repair flow'
        );
        return;
      }

      this.logger?.info(
        `Initializing CarData API client for device ${this.deviceData.id} with client ID ${clientId}`
      );

      // Get shared auth provider and API client from app
      // Multiple vehicles with same client ID will share these instances
      this._authProvider = this.app.getAuthProvider(clientId);
      this._carDataClient = this.app.getApiClient(clientId);

      this.logger?.info(`CarData API client initialized for device ${this.deviceData.id}`);
    } catch (error) {
      this.logger?.error(
        'Failed to initialize CarData API client - device will require repair',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Initialize or reinitialize vehicle data and services
   *
   * Performs complete initialization/reinitialization of vehicle services:
   * 1. Stop existing connections (safe to call even if not running)
   * 2. Initialize API client with credentials from store
   * 3. Initialize state manager with API data
   * 4. Update capabilities from initial status
   * 5. Start MQTT streaming
   * 6. Start API polling
   *
   * @public Used by onInit and ConnectedDriver repair flow
   */
  async initializeVehicleDataAndServices(): Promise<void> {
    // Cleanup existing connections (safe to call even if nothing running)
    if (this._mqttClient) {
      await this._mqttClient.disconnect();
      this._mqttClient = undefined;
    }
    this.stopApiPolling();

    // Initialize API client with credentials from store
    await this.initializeCarDataClient();

    // Verify API client was successfully initialized
    if (!this.api) {
      this.logger?.warn('API client not initialized - skipping vehicle data initialization');
      return;
    }

    // Initialize MQTT streaming for real-time updates
    await this.initializeMqttStreaming();

    // Start API polling for periodic updates
    this.startApiPolling();

    this.logger?.info(`Vehicle data and services initialized for device ${this.deviceData.id}`);
  }

  /**
   * Initialize MQTT streaming for real-time vehicle data updates
   *
   * Connects to BMW CarData MQTT broker and subscribes to vehicle-specific topic.
   * Updates capabilities immediately when messages arrive (no polling delay).
   */
  private async initializeMqttStreaming(): Promise<void> {
    try {
      // Check if streaming is enabled
      if (!this.settings.streamingEnabled) {
        this.logger?.info('MQTT streaming disabled in settings');
        return;
      }

      // Check if auth provider exists
      if (!this._authProvider) {
        this.logger?.warn('Auth provider not initialized - cannot start MQTT streaming');
        return;
      }

      this.logger?.info(`Initializing MQTT streaming for vehicle ${this.deviceData.id}`);

      // Create MQTT client
      this._mqttClient = new MqttStreamClient(
        this._authProvider,
        {
          // Default MQTT options from constants
        },
        this.logger,
        this.deviceData.id // VIN
      );

      // Set up event handlers
      this._mqttClient.onConnect(() => {
        this.logger?.info(`MQTT connected for vehicle ${this.deviceData.id}`);
      });

      this._mqttClient.onDisconnect(() => {
        this.logger?.info(`MQTT disconnected for vehicle ${this.deviceData.id}`);
      });

      this._mqttClient.onError((error) => {
        this.logger?.error(`MQTT error for vehicle ${this.deviceData.id}: ${error.message}`);
      });

      this._mqttClient.onReconnect(() => {
        this.logger?.info(`MQTT reconnecting for vehicle ${this.deviceData.id}`);
      });

      this._mqttClient.onMessage((topic: string, message: StreamMessage) => {
        void this.handleMqttMessage(topic, message);
      });

      // Connect to MQTT broker
      await this._mqttClient.connect();

      // Subscribe to vehicle topic (uses VIN from MqttStreamClient)
      const topic = `${this.deviceData.id}`; // Just the VIN, client adds gcid prefix
      await this._mqttClient.subscribe(topic);

      this.logger?.info(`MQTT streaming initialized for vehicle ${this.deviceData.id}`);
    } catch (error) {
      this.logger?.error(
        `Failed to initialize MQTT streaming for vehicle ${this.deviceData.id} - will use API polling`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handles incoming MQTT stream message
   *
   * Updates device state and capabilities from real-time telematic data.
   *
   * @param _topic - MQTT topic (e.g., "{gcid}/{vin}") - unused but required by callback signature
   * @param message - MQTT stream message with telematic data
   */
  private async handleMqttMessage(_topic: string, message: StreamMessage): Promise<void> {
    await Promise.resolve();

    try {
      // Update state from MQTT message (ALWAYS happens regardless of trip detection)
      this.stateManager.updateFromMqttMessage(message);

      // Check if message contains TRIP category telematic data and update debounce
      await this.checkAndDebounceTripCompletion(message);

      // Update capabilities from updated status
      // await this.updateCapabilitiesFromStatus(updatedStatus);
    } catch (error) {
      this.logger?.error(`Failed to handle MQTT message: ${String(error)}`);
    }
  }

  /**
   * Check if API polling can be started
   *
   * Validates all prerequisites for starting API polling.
   *
   * @returns Validation result with canStart flag and optional reason
   */
  private canStartApiPolling(settings: DeviceSettings): { canStart: boolean; reason?: string } {
    if (!settings.apiPollingEnabled) {
      return { canStart: false, reason: 'API polling is disabled in settings' };
    }

    if (!this.api) {
      return { canStart: false, reason: 'API client not initialized - cannot start API polling' };
    }

    const containerId = this.stateManager.getContainerId();
    if (!containerId) {
      return {
        canStart: false,
        reason: 'No container ID available - API polling requires container',
      };
    }

    return { canStart: true };
  }

  /**
   * Execute a single API poll
   *
   * Fetches raw telematic data from the API and updates the state manager cache.
   * Handles errors gracefully and logs poll status.
   *
   * @private Extracted for testability
   */
  private async executePoll(): Promise<void> {
    try {
      if (!this.api) {
        this.logger?.warn('API client unavailable - skipping poll');
        return;
      }

      const containerId = this.stateManager.getContainerId();
      if (!containerId) {
        this.logger?.warn('Container ID missing - skipping API poll');
        return;
      }

      this.logger?.debug(`Polling API for vehicle ${this.deviceData.id}`);

      // Fetch raw telematic data
      const rawData = await this.api.getRawTelematicData(this.deviceData.id, containerId);

      // Update state manager cache with API data
      await this.stateManager.updateFromApi(rawData);

      this.logger?.debug(
        `API poll completed for vehicle ${this.deviceData.id} (${Object.keys(rawData).length} telematic keys)`
      );
    } catch (error) {
      this.logger?.error(
        `API polling error for vehicle ${this.deviceData.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start API polling for periodic state updates
   *
   * Polls the BMW CarData API at the configured interval to fetch updated
   * telematic data. Uses getRawTelematicData for efficient cache updates.
   *
   * Rate limit: BMW CarData API has 50 requests/24h per vehicle limit.
   * Recommended minimum interval: 30 minutes (48 requests/day).
   */
  private startApiPolling(): void {
    const settings = this.settings;

    // Stop existing timer if running
    this.stopApiPolling();

    // Validate prerequisites
    const validation = this.canStartApiPolling(settings);
    if (!validation.canStart) {
      if (validation.reason) {
        this.logger?.info(validation.reason);
      }
      return;
    }

    const intervalMs = settings.apiPollingInterval * 60 * 1000;
    this.logger?.info(
      `Starting API polling for vehicle ${this.deviceData.id} (interval: ${settings.apiPollingInterval} minutes)`
    );

    // Set up polling timer
    this._apiPollingTimer = setInterval(() => {
      void this.executePoll();
    }, intervalMs);

    // Execute immediate poll
    void this.executePoll();
  }

  /**
   * Stop API polling
   */
  private stopApiPolling(): void {
    if (this._apiPollingTimer) {
      clearInterval(this._apiPollingTimer);
      this._apiPollingTimer = undefined;
      this.logger?.info(`Stopped API polling for vehicle ${this.deviceData.id}`);
    }
  }

  /**
   * Update Homey capabilities from VehicleStatus
   *
   * Extracts data from VehicleStatus and updates corresponding Homey capabilities.
   * Only updates capabilities that have changed to avoid unnecessary events.
   *
   * @param status - Vehicle status with telematic data
   * @param settingsOverride - Optional settings to use instead of reading from device (used during onSettings)
   */
  private async updateCapabilitiesFromStatus(
    status: VehicleStatus,
    settingsOverride?: DeviceSettings
  ): Promise<void> {
    const settings = settingsOverride ?? this.settings;

    // Update drive train type capability
    // Update mileage
    if (status.currentMileage !== undefined) {
      await this.setCapabilityValueSafe(
        Capabilities.MILEAGE,
        UnitConverter.ConvertDistance(status.currentMileage, settings.distanceUnit)
      );
    }

    // Update total range (lastRemainingRange from MQTT)
    if (status.range !== undefined) {
      await this.setCapabilityValueSafe(
        Capabilities.RANGE,
        UnitConverter.ConvertDistance(status.range, settings.distanceUnit)
      );
    }

    // Update location - always update state for accurate tracking
    if (status.location) {
      const newLocation: LocationType = {
        label: '',
        latitude: status.location.coordinates.latitude,
        longitude: status.location.coordinates.longitude,
        address: status.location.address?.formatted ?? '',
      };

      // Check geofence (sets label and address if within configured zones)
      await this.checkGeofence(newLocation);

      // Get locations for flow trigger logic
      const currentLocation = this.stateManager.getLastLocation();
      const lastFlowLocation = this.stateManager.getLastFlowTriggeredLocation() ?? currentLocation;

      // Always persist new location to state (no threshold - ensures accurate trip tracking)
      await this.stateManager.setLastLocation(newLocation);

      // Check if flows should trigger (compares against last FLOW location, not current)
      const shouldTriggerFlows = this.shouldTriggerLocationFlows(lastFlowLocation, newLocation);
      if (shouldTriggerFlows) {
        // Update flow trigger marker
        await this.stateManager.setLastFlowTriggeredLocation(newLocation);
        // Trigger flows with previous current location and new location
        await this.triggerLocationFlows(currentLocation, newLocation);
      }
    }

    // Update doors
    if (status.doors) {
      await this.setCapabilityValueSafe(Capabilities.DOOR_STATE, status.doors.combinedState);
    }

    // Update windows
    if (status.windows) {
      await this.setCapabilityValueSafe(Capabilities.WINDOW_STATE, status.windows.combinedState);
    }

    // Update lock state (read-only status, not control)
    if (status.lockState) {
      const isLocked = status.lockState.isLocked;
      await this.setCapabilityValueSafe(Capabilities.ALARM_GENERIC, !isLocked);
    }

    // Update electric vehicle data
    if (status.electric) {
      await this.setCapabilityValueSafe(
        Capabilities.MEASURE_BATTERY,
        status.electric.chargeLevelPercent
      );

      if (status.combustion) {
        // If it is only electric, we do not need a separate RANGE_BATTERY capability
        await this.setCapabilityValueSafe(
          Capabilities.RANGE_BATTERY,
          UnitConverter.ConvertDistance(status.electric.range, settings.distanceUnit)
        );
      }

      // Convert BMW charging status to Homey EV charging state
      if (status.electric.chargingStatus) {
        const oldChargingStatus = this.currentVehicleState?.electric?.chargingStatus;
        const newChargingStatus = status.electric.chargingStatus;

        await this.setCapabilityValueSafe(
          Capabilities.EV_CHARGING_STATE,
          this.convertChargingStatus(newChargingStatus)
        );

        // Trigger charging status change flow if status changed or first status update
        if (!oldChargingStatus || oldChargingStatus !== newChargingStatus) {
          const chargingStatusChangeFlowCard = this.homey.flow.getDeviceTriggerCard(
            Flows.CHARGING_STATUS_CHANGE
          );
          await chargingStatusChangeFlowCard.trigger(
            this,
            {
              charging_status: newChargingStatus ?? 'UNKNOWN',
            },
            {}
          );
        }
      }

      // TODO: Add these capabilities if needed
      // if (status.electric.chargingTarget !== undefined) {
      //   await this.updateCapabilityValue('charging_target', status.electric.chargingTarget);
      // }

      // if (status.electric.remainingChargingMinutes !== undefined) {
      //   await this.updateCapabilityValue('remaining_charging_time', status.electric.remainingChargingMinutes);
      // }

      // if (status.electric.isChargerConnected !== undefined) {
      //   await this.updateCapabilityValue('charger_connected', status.electric.isChargerConnected);
      // }
    }

    // Update combustion vehicle data
    if (status.combustion) {
      // TODO: Add fuel level percentage capability if needed
      // if (status.combustion.fuelLevelPercent !== undefined) {
      //   await this.updateCapabilityValue('fuel_level_percentage', status.combustion.fuelLevelPercent);
      // }

      const newFuelValue = status.combustion.fuelLevelLiters;
      if (newFuelValue !== undefined) {
        await this.setCapabilityValueSafe(
          Capabilities.REMAINING_FUEL,
          newFuelValue ? UnitConverter.ConvertFuel(newFuelValue, settings.fuelUnit) : null
        );

        const oldFuelValue = this.currentVehicleState?.combustion?.fuelLevelLiters;
        // Trigger refuelled flow if fuel level increased beyond threshold
        if (
          oldFuelValue !== undefined &&
          newFuelValue - oldFuelValue >= this.settings.refuellingTriggerThreshold
        ) {
          const refuelledFlowCard = this.homey.flow.getDeviceTriggerCard(Flows.REFUELLED);
          const location = this.stateManager.getLastLocation();
          if (location && !location.address) {
            await this.resolveAddress(location);
            await this.stateManager.setLastLocation(location);
          }
          await refuelledFlowCard.trigger(
            this,
            {
              FuelBeforeRefuelling: oldFuelValue,
              FuelAfterRefuelling: newFuelValue,
              RefuelledLiters: newFuelValue - oldFuelValue,
              Location: location?.address ?? '',
            },
            {}
          );
        }
      }
    }

    // Update climate preconditioning state
    if (status.climate) {
      await this.setCapabilityValueSafe(Capabilities.CLIMATE_STATUS, status.climate.activity);
    }

    this.currentVehicleState = status;

    this.logger?.info(`Updated capabilities from status for vehicle ${status.vin}`);
  }

  async migrate_device_capabilities() {
    // Clean up old capabilities
    await this.removeCapabilitySafe(Capabilities.MEASURE_BATTERY_ACTUAL);
    await this.removeCapabilitySafe(Capabilities.RANGE_FUEL);
    await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL_LITERS_TYPO);
    await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL_LITERS);
    await this.removeCapabilitySafe(Capabilities.LOCATION);
    await this.removeCapabilitySafe(Capabilities.ADDRESS);

    // BMW CarData API migration: Remove all remote service capabilities
    // These are no longer supported by the CarData API
    await this.removeCapabilitySafe(Capabilities.LOCKED); // Lock/unlock control
    await this.removeCapabilitySafe(Capabilities.CLIMATE_NOW); // Climate control
    await this.removeCapabilitySafe(Capabilities.CHARGING_CONTROL); // Charging on/off
    await this.removeCapabilitySafe(Capabilities.START_CHARGING); // Flow action
    await this.removeCapabilitySafe(Capabilities.STOP_CHARGING); // Flow action
    await this.removeCapabilitySafe(Capabilities.AC_CHARGING_LIMIT); // AC limit control
    await this.removeCapabilitySafe(Capabilities.CHARGING_TARGET_SOC); // Target charge control

    // Migrate device class to 'car' for Homey v12+ regardless of drivetrain state
    if (semver.gte(this.homey.version, '12.0.0')) {
      if (this.getClass() === 'other') {
        this.logger?.info(`Migrating device class for '${this.getName()}' to 'car'.`);
        await this.setClass('car');
      }
    }

    // Get drive train type from persisted store (set during initialization)
    const driveTrain = this.stateManager.getDriveTrain();
    if (driveTrain == DriveTrainType.UNKNOWN) {
      this.logger?.warn(
        `No drive train found in store for '${this.getName()}' - skipping capability migration`
      );
      return;
    }

    // Use drive train type to determine capabilities
    const hasElectricDriveTrain = HV_BATTERY_DRIVE_TRAINS.has(driveTrain);
    const hasCombustionDriveTrain = COMBUSTION_ENGINE_DRIVE_TRAINS.has(driveTrain);

    this.logger?.info(
      `Vehicle '${this.getName()}' drivetrain: ${driveTrain} (electric=${hasElectricDriveTrain}, combustion=${hasCombustionDriveTrain})`
    );

    // Add/remove electric capabilities based on drivetrain
    if (hasElectricDriveTrain) {
      this.logger?.info(`Vehicle '${this.getName()}' has electric drive train.`);
      await this.addCapabilitySafe(Capabilities.MEASURE_BATTERY);
      await this.addCapabilitySafe(Capabilities.EV_CHARGING_STATE);
    } else {
      await this.removeCapabilitySafe(Capabilities.MEASURE_BATTERY);
      await this.removeCapabilitySafe(Capabilities.RANGE_BATTERY);
      await this.removeCapabilitySafe(Capabilities.EV_CHARGING_STATE);
    }

    // RANGE_BATTERY (electric range) is only meaningful alongside a combustion range.
    // Pure BEVs use range_capability directly; PHEVs/range-extenders need both.
    if (hasElectricDriveTrain && hasCombustionDriveTrain) {
      await this.addCapabilitySafe(Capabilities.RANGE_BATTERY);
    } else {
      await this.removeCapabilitySafe(Capabilities.RANGE_BATTERY);
    }

    // Remove legacy CHARGING_STATUS capability
    await this.removeCapabilitySafe(Capabilities.CHARGING_STATUS);

    // Add/remove combustion capabilities based on drivetrain
    if (hasCombustionDriveTrain) {
      this.logger?.info(`Vehicle '${this.getName()}' has combustion drive train.`);
      await this.addCapabilitySafe(Capabilities.REMAINING_FUEL);
    } else {
      await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL);
    }

    if (hasElectricDriveTrain || hasCombustionDriveTrain) {
      await this.addCapabilitySafe(Capabilities.RANGE);
    } else {
      await this.removeCapabilitySafe(Capabilities.RANGE);
    }

    // Door and window state capabilities are available for all vehicles
    await this.addCapabilitySafe(Capabilities.DOOR_STATE);
    await this.addCapabilitySafe(Capabilities.WINDOW_STATE);

    // Climate preconditioning status is available for all vehicles
    await this.addCapabilitySafe(Capabilities.CLIMATE_STATUS);

    // Add EV charging state capability for Homey v12.4.5+
    if (semver.gte(this.homey.version, '12.4.5') && hasElectricDriveTrain) {
      await this.addCapabilitySafe(Capabilities.EV_CHARGING_STATE);

      const energy = this.getEnergy() as { batteries?: string[]; electricCar?: boolean };
      if (energy?.batteries?.[0] !== 'INTERNAL' || !energy?.electricCar) {
        this.logger?.info('Setting energy capabilities for electric car.');
        await this.setEnergy({
          batteries: ['INTERNAL'],
          electricCar: true,
        });
      }
    }
  }

  /**
   * Migrate settings to ensure proper functionality after upgrading
   */
  async migrate_device_settings() {
    const settings = this.settings;
    this.logger?.info(`Settings version is ${settings.currentVersion}.`);

    const homeyVersion = (this.homey.app.manifest as { version: string })?.version;
    if (homeyVersion && settings.currentVersion !== homeyVersion) {
      await this.setSettings({ ...settings, currentVersion: homeyVersion });
    }

    // Set up unit display preferences
    await this.setDistanceUnits(settings.distanceUnit);
    await this.setFuelUnits(settings.fuelUnit);
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    // Debug: Log full settings object to verify clientId/containerId are preserved
    this.logger?.debug(
      `onSettings called - changedKeys: ${JSON.stringify(changedKeys)}, newSettings: ${JSON.stringify(newSettings)}`
    );

    // Use newSettings directly - Homey SDK already merged it with current settings
    const settings = newSettings as unknown as DeviceSettings;

    // Handle API polling changes (interval and/or enabled state)
    const apiPollingChanged =
      changedKeys.includes(nameOf<DeviceSettings>('apiPollingInterval')) ||
      changedKeys.includes(nameOf<DeviceSettings>('apiPollingEnabled'));

    if (apiPollingChanged) {
      if (changedKeys.includes(nameOf<DeviceSettings>('apiPollingInterval'))) {
        this.logger?.info(`API polling interval changed to ${settings.apiPollingInterval} minutes`);
      }
      if (changedKeys.includes(nameOf<DeviceSettings>('apiPollingEnabled'))) {
        this.logger?.info(`API polling ${settings.apiPollingEnabled ? 'enabled' : 'disabled'}`);
      }

      // Start or stop API polling based on current enabled state
      if (settings.apiPollingEnabled) {
        this.startApiPolling();
      } else {
        this.stopApiPolling();
      }
    }

    // Handle streaming enabled/disabled changes
    if (changedKeys.includes(nameOf<DeviceSettings>('streamingEnabled'))) {
      this.logger?.info(`MQTT streaming ${settings.streamingEnabled ? 'enabled' : 'disabled'}`);
      // Start or stop MQTT streaming
      if (settings.streamingEnabled) {
        await this.initializeMqttStreaming();
      } else {
        if (this._mqttClient) {
          await this._mqttClient.disconnect();
          this._mqttClient = undefined;
        }
      }
    }

    let shouldUpdateState = false;

    if (changedKeys.includes(nameOf<DeviceSettings>('distanceUnit'))) {
      this.app.logger?.info(`Distance unit changed.`);

      await this.setDistanceUnits(settings.distanceUnit);
      shouldUpdateState = true;
    }

    if (changedKeys.includes(nameOf<DeviceSettings>('fuelUnit'))) {
      this.app.logger?.info(`Fuel unit changed.`);

      await this.setFuelUnits(settings.fuelUnit);
      shouldUpdateState = true;
    }

    if (shouldUpdateState) {
      try {
        const status = this.stateManager.getVehicleStatus();
        // Pass new settings explicitly since they're not persisted yet
        await this.updateCapabilitiesFromStatus(status, settings);
      } catch (err) {
        this.logger?.error('Failed to get vehicle status for update', err as Error);
      }
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} _name The new name
   */
  onRenamed(_name: string) {
    this.logger?.info('Vehicle was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  onDeleted() {
    this.logger?.info('Vehicle has been deleted');

    // Stop MQTT streaming
    if (this._mqttClient) {
      this._mqttClient
        .disconnect()
        .then(() => {
          this.logger?.info('MQTT client disconnected successfully');
        })
        .catch((error) => {
          this.logger?.error(`Error disconnecting MQTT client: ${String(error)}`);
        });
    }

    // Stop API polling
    this.stopApiPolling();

    // Clear trip debounce timer
    if (this._tripDebounceTimer) {
      clearTimeout(this._tripDebounceTimer);
      this._tripDebounceTimer = undefined;
    }
  }

  // Note: Remote service capability listeners removed during BMW CarData API migration
  // The following methods have been removed as they are no longer supported:
  // - onCapabilityClimateNow() - Climate control not supported by CarData API
  // - onCapabilityLocked() - Lock/unlock not supported by CarData API
  // - onCapabilityChargingControl() - Charging control not supported by CarData API
  // - onCapabilityACChargingLimit() - AC limit control not supported by CarData API
  // - onCapabilityChargingTargetSoc() - Target SoC control not supported by CarData API

  /**
   * Get cached TRIP category keys
   *
   * Lazy loads and caches the set of telematic keys belonging to TRIP category.
   *
   * @returns Set of TRIP category telematic key strings
   */
  private static async getTripCategoryKeys(): Promise<Set<string>> {
    if (!Vehicle._tripCategoryKeys) {
      const { TelematicCategory, getKeysByCategory } = await import('../lib/types/TelematicKeys');
      const tripKeys = getKeysByCategory(TelematicCategory.TRIP);
      Vehicle._tripCategoryKeys = new Set(tripKeys.map((k) => k.key));
    }
    return Vehicle._tripCategoryKeys;
  }

  /**
   * Check MQTT message for TRIP category and debounce trip completion trigger
   *
   * Uses short 1-second trailing-edge debounce that resets on ANY MQTT message.
   * Timer existence indicates TRIP data was seen in the session.
   *
   * @param message - MQTT stream message to check
   */
  private async checkAndDebounceTripCompletion(message: StreamMessage): Promise<void> {
    try {
      // Get cached TRIP category keys
      const tripKeys = await Vehicle.getTripCategoryKeys();

      // Check if any telematic key in message belongs to TRIP category
      const hasTripData = Object.keys(message.data).some((key) => tripKeys.has(key));

      // Start timer on first TRIP message
      if (hasTripData && !this._tripDebounceTimer) {
        this.logger?.debug('First TRIP message received - starting debounce timer');
      } else if (hasTripData) {
        this.logger?.debug('Trip message received - extending debounce timer');
      }

      // Extend/reset timer if it exists (on ANY MQTT message)
      if (this._tripDebounceTimer) {
        clearTimeout(this._tripDebounceTimer);
      } else if (!hasTripData) {
        // No timer and not a TRIP message - nothing to do
        return;
      }

      // Set up 1-second debounce timer
      this._tripDebounceTimer = setTimeout(() => {
        // Timer existence guarantees we saw TRIP data
        this.logger?.info('MQTT messages stopped - triggering drive_session_completed');

        // Trigger flow with final state (all messages processed)
        void this.triggerDriveSessionCompleted();

        // Reset timer
        this._tripDebounceTimer = undefined;
      }, Vehicle.TRIP_DEBOUNCE_WINDOW_MS);
    } catch (error) {
      this.logger?.error(
        `Failed to check trip completion: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Trigger drive session started flow card
   *
   * Extracts trip start data from current state.
   * Called when first significant location change detected while not driving.
   */
  private async triggerDriveSessionStarted(): Promise<void> {
    const settings = this.settings;
    try {
      // Get drive start location from last trip complete location (where previous trip ended)
      const startLocation = this.stateManager.getLastTripCompleteLocation();
      if (!startLocation) {
        this.logger?.warn('No start location available for drive session started');
        return;
      }

      // Ensure address is resolved if not already set
      if (!startLocation.address) {
        await this.checkGeofence(startLocation, true);
      }

      // Get starting mileage
      const startMileage = this.stateManager.getLastTripCompleteMileage() ?? 0;

      // Trigger flow card
      const driveSessionStartedFlowCard = this.homey.flow.getDeviceTriggerCard(
        Flows.DRIVE_SESSION_STARTED
      );

      await driveSessionStartedFlowCard.trigger(
        this,
        {
          StartLabel: startLocation.label ?? '',
          StartLatitude: startLocation.latitude,
          StartLongitude: startLocation.longitude,
          StartAddress: startLocation.address ?? '',
          StartMileage: UnitConverter.ConvertDistance(startMileage, settings.distanceUnit),
        },
        {}
      );

      this.logger?.info(
        `Drive session started flow triggered from ${startLocation.label || 'location'} at ${startMileage} km`
      );

      // Set driving state
      await this.stateManager.setIsDriving(true);
    } catch (error) {
      this.logger?.error(
        `Failed to trigger drive session started: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Trigger drive session completed flow card
   *
   * Extracts trip data from current and previous vehicle state.
   */
  private async triggerDriveSessionCompleted(): Promise<void> {
    const settings = this.settings;
    try {
      // Get current state (updated from latest TRIP messages)
      const currentState = this.stateManager.getVehicleStatus();

      // Get trip start location from state manager (persisted, may be undefined on first trip)
      const startLocation = this.stateManager.getLastTripCompleteLocation();
      if (!startLocation) {
        this.logger?.warn('No start location available for trip completion');
        return;
      }

      // Get trip end location from last known location (already has label, address, etc.)
      const endLocation = this.stateManager.getLastLocation();
      if (!endLocation) {
        this.logger?.warn('No last location available for trip completion');
        return;
      }

      // Ensure address is resolved for trip completion if not already set
      if (!endLocation.address) {
        await this.checkGeofence(endLocation, true);
      }

      // Get mileage values (trip start mileage tracked in state manager, may be undefined on first trip)
      const startMileage = this.stateManager.getLastTripCompleteMileage() ?? 0;
      const endMileage = currentState.currentMileage ?? startMileage;

      // Trigger flow card
      const driveSessionCompletedFlowCard = this.homey.flow.getDeviceTriggerCard(
        Flows.DRIVE_SESSION_COMPLETED
      );

      await driveSessionCompletedFlowCard.trigger(
        this,
        {
          StartLabel: startLocation.label ?? '',
          StartLatitude: startLocation.latitude,
          StartLongitude: startLocation.longitude,
          StartAddress: startLocation.address ?? '',
          StartMileage: UnitConverter.ConvertDistance(startMileage, settings.distanceUnit),
          EndLabel: endLocation.label ?? '',
          EndLatitude: endLocation.latitude,
          EndLongitude: endLocation.longitude,
          EndAddress: endLocation.address ?? '',
          EndMileage: UnitConverter.ConvertDistance(endMileage, settings.distanceUnit),
        },
        {}
      );

      this.logger?.info(
        `Drive session completed flow triggered (${startMileage} → ${endMileage} km, ${endMileage - startMileage} km traveled)`
      );

      // Update last trip complete location/mileage in state manager (persists to store)
      await this.stateManager.setLastTripCompleteLocation(endLocation);
      await this.stateManager.setLastTripCompleteMileage(endMileage);

      // Reset driving state
      await this.stateManager.setIsDriving(false);
    } catch (error) {
      this.logger?.error(
        `Failed to trigger drive session completed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async checkGeofence(location: LocationType, resolveAddress: boolean = false) {
    await Promise.resolve();

    const configuration = ConfigurationManager.getConfiguration(this.homey);
    if (configuration?.geofences) {
      this.logger?.info('Checking geofences.');
      // Checking if the position is inside a geofence.
      const position = configuration.geofences.find(
        (fence) =>
          fence?.longitude &&
          fence?.latitude &&
          geo.insideCircle(location, fence, fence.radius ?? 20)
      );
      if (position) {
        this.logger?.info(`Inside geofence '${position.label}'.`);
        location.label = position.label;
        location.address = position.address;
        return;
      }
    }

    // Resolve address using OpenStreetMap if not available and resolveAddress is true
    if (resolveAddress) {
      await this.resolveAddress(location);
    }
  }

  /**
   * Determines if location flow cards should be triggered
   *
   * Flow cards are triggered if:
   * - No previous location exists (first location update), OR
   * - Geofence changed (entering/exiting labeled zones), OR
   * - Significant distance change (>50 meters to reduce GPS noise spam)
   *
   * @param oldLocation - Previous location from state
   * @param newLocation - New location with geofence info already set
   * @returns True if flows should trigger
   */
  private shouldTriggerLocationFlows(
    oldLocation: LocationType | undefined,
    newLocation: LocationType
  ): boolean {
    // Always trigger on first location
    if (!oldLocation) {
      return true;
    }

    // Always trigger if geofence changed (entering/exiting labeled zones)
    // This takes priority over distance threshold
    if (oldLocation.label !== newLocation.label) {
      return true;
    }

    // Only check distance if geofence didn't change
    // Trigger if significant distance change (>50 meters)
    const distance = geo.distanceTo(
      { latitude: newLocation.latitude, longitude: newLocation.longitude },
      { latitude: oldLocation.latitude, longitude: oldLocation.longitude }
    );

    return distance > Vehicle.LOCATION_CHANGE_THRESHOLD_METERS;
  }

  /**
   * Triggers location-related flow cards
   *
   * Triggers:
   * - drive_session_started: When first significant location change detected while not driving
   * - location_changed: Always when this method is called
   * - geo_fence_enter: When entering a labeled geofence
   * - geo_fence_exit: When exiting a labeled geofence
   *
   * @param oldLocation - Previous location (may be undefined)
   * @param newLocation - New location with geofence info
   */
  private async triggerLocationFlows(
    oldLocation: LocationType | undefined,
    newLocation: LocationType
  ): Promise<void> {
    this.logger?.info('Location changed - triggering flow cards');

    // Check if drive is starting (first significant location change while not driving)
    const isDriving = this.stateManager.getIsDriving();
    if (!isDriving) {
      this.logger?.info('Drive starting - vehicle was not driving');
      await this.triggerDriveSessionStarted();
    }

    // Always trigger location changed flow
    const locationChangedFlowCard = this.homey.flow.getDeviceTriggerCard(Flows.LOCATION_CHANGED);
    await locationChangedFlowCard.trigger(
      this,
      {
        label: newLocation.label ?? '',
        latitude: newLocation.latitude,
        longitude: newLocation.longitude,
        address: newLocation.address ?? '',
      },
      {}
    );

    // Trigger geofence flow cards if geofence changed
    if (oldLocation && oldLocation.label !== newLocation.label) {
      this.logger?.info(
        `Geofence changed. Old Location: [${oldLocation.label}]. New Location: [${newLocation.label}]`
      );

      if (newLocation.label) {
        this.logger?.info('Entered geofence.');
        const geoFenceEnter = this.homey.flow.getDeviceTriggerCard(Flows.GEO_FENCE_ENTER);
        await geoFenceEnter.trigger(
          this,
          {
            label: newLocation.label ?? '',
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
            address: newLocation.address ?? '',
          },
          {}
        );
      }

      if (oldLocation.label) {
        this.logger?.info('Exit geofence.');
        const geoFenceExit = this.homey.flow.getDeviceTriggerCard(Flows.GEO_FENCE_EXIT);
        await geoFenceExit.trigger(
          this,
          {
            label: oldLocation.label ?? '',
            latitude: oldLocation.latitude,
            longitude: oldLocation.longitude,
            address: oldLocation.address ?? '',
          },
          {}
        );
      }
    }
  }

  private async addCapabilitySafe(name: string): Promise<void> {
    if (!this.hasCapability(name)) {
      this.logger?.info(`Adding capability ${name} to device '${this.getName()}'`);
      await this.addCapability(name);
    }
  }

  private async removeCapabilitySafe<T>(name: string): Promise<T | undefined> {
    if (this.hasCapability(name)) {
      this.logger?.info(`Removing capability ${name} from device '${this.getName()}'`);
      const oldValue = await this.getCapabilityValueSafe<T>(name);
      await this.removeCapability(name);
      return oldValue;
    }

    return undefined;
  }

  private async getCapabilityValueSafe<T>(name: string): Promise<T | undefined> {
    return Capabilities.GetCapabilityValueSafe<T>(this, name);
  }

  private async setCapabilityValueSafe<T>(name: string, value: T): Promise<boolean> {
    if (value || value === 0 || value === false) {
      await this.addCapabilitySafe(name);

      await this.setCapabilityValue(name, value);
      return true;
    }

    return false;
  }

  private async setDistanceUnits(distanceUnit: string) {
    this.logger?.info(`Setting distance unit to ${distanceUnit}`);

    await this.setCapabilityOptions(Capabilities.MILEAGE, {
      units: distanceUnit === 'metric' ? 'km' : 'miles',
    });
    await this.setCapabilityOptions(Capabilities.RANGE, {
      units: distanceUnit === 'metric' ? 'km' : 'miles',
    });
    if (this.hasCapability(Capabilities.RANGE_BATTERY)) {
      await this.setCapabilityOptions(Capabilities.RANGE_BATTERY, {
        units: distanceUnit === 'metric' ? 'km' : 'miles',
      });
    }
  }

  private async setFuelUnits(fuelUnit: string) {
    this.logger?.info(`Setting fuel unit to ${fuelUnit}`);

    await this.setCapabilityOptions(Capabilities.REMAINING_FUEL, {
      units: fuelUnit === 'liter' ? 'l' : 'gal',
    });
  }

  /**
   * Convert BMW charging status to Homey EV charging state
   *
   * BMW statuses:
   * - CHARGING: Actively charging
   * - PLUGGED_IN: Connected to charger but not charging (e.g., scheduled charging, full battery)
   * - WAITING_FOR_CHARGING: Connected, waiting to start (scheduled or target reached)
   * - COMPLETE/FULLY_CHARGED/FINISHED_FULLY_CHARGED: Charging complete, still plugged in
   * - FINISHED_NOT_FULL: Charging stopped before full, still plugged in
   * - TARGET_REACHED: Reached charge target, still plugged in
   * - NOT_CHARGING: Not connected to charger (unplugged)
   * - INVALID/UNKNOWN: Unknown status
   *
   * Homey states: plugged_in_charging, plugged_in, plugged_out
   */
  private convertChargingStatus(chargingStatus: string): string {
    switch (chargingStatus) {
      case 'CHARGING':
        return 'plugged_in_charging';

      // Connected to charger but not actively charging
      case 'PLUGGED_IN':
      case 'WAITING_FOR_CHARGING':
      case 'COMPLETE':
      case 'FULLY_CHARGED':
      case 'FINISHED_FULLY_CHARGED':
      case 'FINISHED_NOT_FULL':
      case 'TARGET_REACHED':
        return 'plugged_in';

      // Not connected to charger
      case 'NOT_CHARGING':
      case 'INVALID':
      default:
        return 'plugged_out';
    }
  }

  private async resolveAddress(location: LocationType): Promise<void> {
    // Resolve address using OpenStreetMap if not available and resolveAddress is true
    if (!location.address) {
      try {
        const { OpenStreetMap } = await import('../utils/OpenStreetMap');
        const resolvedAddress = await OpenStreetMap.GetAddress(
          location.latitude,
          location.longitude,
          this.logger
        );
        if (resolvedAddress) {
          location.address = resolvedAddress;
          this.logger?.info(`Resolved address via OpenStreetMap: ${resolvedAddress}`);
        }
      } catch (error) {
        this.logger?.error(
          `Failed to resolve address via OpenStreetMap: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
