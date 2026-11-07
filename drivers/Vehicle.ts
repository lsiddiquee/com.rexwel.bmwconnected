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
import { ApiError, RateLimitError } from '../lib/types/errors';
import type { ContainerManager } from '../lib/api/ContainerManager';
import { DeviceStateManager } from '../utils/DeviceStateManager';
import {
  HV_BATTERY_DRIVE_TRAINS,
  COMBUSTION_ENGINE_DRIVE_TRAINS,
  DriveTrainType,
} from '../lib/types/DriveTrainType';
import { UnitConverter } from '../utils/UnitConverter';
import { Flows } from '../utils/Flows';
import { STORE_KEY_LAST_DATA_UPDATE } from '../utils/StoreKeys';
import {
  isStreamState,
  mapConnectionState,
  STREAM_STATE_TITLES,
  StreamState,
  StreamStateContext,
} from '../utils/StreamState';
import { getStreamRetryDelayMs, STREAM_WATCHDOG_INTERVAL_MS } from '../utils/StreamRetry';
import {
  formatLastUpdate,
  isCarDataFresh as isTimestampFresh,
  LAST_DATA_UPDATE_PERSIST_INTERVAL_MS,
  resolveCarDataTimeMs,
} from '../utils/CarDataFreshness';
import type { ConnectionState } from '../lib/streaming/IMqttClient';

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

  // Stream start retry state. These are intentionally declared without initializers and read
  // with `?? default`, so they behave the same when a test builds a Vehicle without its constructor.
  // Homey-managed timer for the next scheduled stream start attempt (exponential backoff)
  private _streamRetryTimer?: NodeJS.Timeout;
  // Consecutive failed stream start attempts since the last successful start (undefined = 0)
  private _streamRetryAttempt?: number;
  // Bumped on every cancellation so an in-flight attempt knows it has been superseded (undefined = 0)
  private _streamGeneration?: number;
  // Generation of the stream start attempt that is currently running, if any
  private _streamAttemptGeneration?: number;
  // Streaming setting as last applied by this device. onSettings runs before Homey persists the new
  // value, so getSettings() cannot be trusted there.
  private _streamingEnabled?: boolean;
  // Last stream state shown in the cardata_stream_state capability
  private _streamState?: StreamState;
  // Homey-managed interval that restarts a stopped stream (see runStreamWatchdog)
  private _streamWatchdogTimer?: NodeJS.Timeout;
  // Last text shown in the cardata_last_update capability
  private _lastUpdateLabel?: string;
  // Time the car measured the newest data we received (epoch ms), kept in memory between throttled
  // store writes
  private _lastDataUpdateMs?: number;
  // Time (wall clock) the last-update value was last written to the device store (epoch ms)
  private _lastDataUpdatePersistedMs?: number;

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
   * 7. Start the stream watchdog
   *
   * @public Used by onInit and ConnectedDriver repair flow
   */
  async initializeVehicleDataAndServices(): Promise<void> {
    // Cleanup existing connections (safe to call even if nothing running).
    // Cancelling also drops a pending stream start retry so re-initialisation starts from scratch.
    this.cancelStreamRetry();
    this.stopStreamWatchdog();
    await this.disposeMqttClient();
    this.stopApiPolling();

    // Initialize API client with credentials from store
    await this.initializeCarDataClient();

    // Verify API client was successfully initialized
    if (!this.api) {
      this.logger?.warn('API client not initialized - skipping vehicle data initialization');
      const streamingEnabled = this.settings.streamingEnabled;
      this._streamingEnabled = streamingEnabled;
      await this.setStreamState(streamingEnabled ? StreamState.UNAVAILABLE : StreamState.DISABLED);
      return;
    }

    // Initialize MQTT streaming for real-time updates
    await this.initializeMqttStreaming();

    // Start API polling for periodic updates
    this.startApiPolling();

    // Keep an eye on the stream from now on
    this.startStreamWatchdog();

    this.logger?.info(`Vehicle data and services initialized for device ${this.deviceData.id}`);
  }

  /**
   * Initialize MQTT streaming for real-time vehicle data updates
   *
   * Connects to BMW CarData MQTT broker and subscribes to vehicle-specific topic.
   * Updates capabilities immediately when messages arrive (no polling delay).
   *
   * Always supersedes a pending retry or in-flight attempt. When the stream cannot be started
   * a retry with exponential backoff is scheduled (see {@link startMqttStream}), so the app only
   * falls back to API polling temporarily.
   *
   * @param settingsOverride - Optional settings to use instead of reading from device (used during
   *   onSettings, where Homey has not persisted the new values yet)
   */
  private async initializeMqttStreaming(settingsOverride?: DeviceSettings): Promise<void> {
    const settings = settingsOverride ?? this.settings;
    this._streamingEnabled = settings.streamingEnabled;

    // A (re)start replaces whatever was pending and restarts the backoff schedule
    this.cancelStreamRetry();

    // Check if streaming is enabled
    if (!settings.streamingEnabled) {
      this.logger?.info('MQTT streaming disabled in settings');
      await this.setStreamState(StreamState.DISABLED);
      return;
    }

    // Check if auth provider exists
    if (!this._authProvider) {
      this.logger?.warn('Auth provider not initialized - cannot start MQTT streaming');
      await this.setStreamState(StreamState.UNAVAILABLE);
      return;
    }

    await this.startMqttStream();
  }

  /**
   * Make one attempt to start the MQTT stream: dispose the previous (half-created) client,
   * create a fresh one, connect and subscribe to the vehicle topic.
   *
   * On failure a retry is scheduled with exponential backoff. Never runs two attempts at once,
   * and an attempt that is cancelled while in flight (device deleted, streaming turned off,
   * services re-initialised) cleans up after itself without scheduling anything.
   */
  private async startMqttStream(): Promise<void> {
    const generation = this._streamGeneration ?? 0;

    // Never run two attempts at once
    if (this._streamAttemptGeneration === generation) {
      this.logger?.debug(
        `MQTT stream start already in progress for vehicle ${this.deviceData.id} - skipping`
      );
      return;
    }
    this._streamAttemptGeneration = generation;

    let client: MqttStreamClient | undefined;
    try {
      // Dispose the previous client first: a failed start can leave a half-created one behind
      await this.disposeMqttClient();
      if (this.isStreamAttemptCancelled(generation)) {
        return;
      }

      const authProvider = this._authProvider;
      if (!authProvider) {
        this.logger?.warn('Auth provider not initialized - cannot start MQTT streaming');
        await this.setStreamState(StreamState.UNAVAILABLE);
        return;
      }

      this.logger?.info(`Initializing MQTT streaming for vehicle ${this.deviceData.id}`);
      await this.setStreamState(mapConnectionState('connecting', this.getStreamStateContext()));
      if (this.isStreamAttemptCancelled(generation)) {
        return;
      }

      // Create MQTT client
      client = new MqttStreamClient(
        authProvider,
        {
          // Default MQTT options from constants
        },
        this.logger,
        this.deviceData.id // VIN
      );
      this._mqttClient = client;
      this.registerMqttHandlers(client);

      // Connect to MQTT broker
      await client.connect();
      if (this.isStreamAttemptCancelled(generation)) {
        await this.disconnectQuietly(client);
        return;
      }

      // Subscribe to vehicle topic (uses VIN from MqttStreamClient)
      const topic = `${this.deviceData.id}`; // Just the VIN, client adds gcid prefix
      await client.subscribe(topic);
      if (this.isStreamAttemptCancelled(generation)) {
        await this.disconnectQuietly(client);
        return;
      }

      // Started: the next failure begins the backoff schedule from the start again
      this._streamRetryAttempt = 0;
      this.logger?.info(`MQTT streaming initialized for vehicle ${this.deviceData.id}`);
    } catch (error) {
      if (this.isStreamAttemptCancelled(generation)) {
        // Cancelled while in flight: the failure is expected, nobody wants a retry
        this.logger?.debug(
          `Cancelled MQTT stream start for vehicle ${this.deviceData.id} failed: ${String(error)}`
        );
        if (client) {
          await this.disconnectQuietly(client);
        }
        return;
      }

      this.logger?.error(
        `Failed to initialize MQTT streaming for vehicle ${this.deviceData.id} - will use API polling`,
        error instanceof Error ? error : undefined
      );
      await this.scheduleStreamRetry();

      // Do not leave the half-created client behind: mqtt.js keeps reconnecting in the background
      if (client) {
        await this.disconnectQuietly(client);
        if (this._mqttClient === client) {
          this._mqttClient = undefined;
        }
      }
    } finally {
      if (this._streamAttemptGeneration === generation) {
        this._streamAttemptGeneration = undefined;
      }
    }
  }

  /**
   * Register the event handlers of a freshly created MQTT client.
   *
   * @param client - The MQTT client to wire up
   */
  private registerMqttHandlers(client: MqttStreamClient): void {
    client.onConnect(() => {
      this.logger?.info(`MQTT connected for vehicle ${this.deviceData.id}`);
    });

    client.onDisconnect(() => {
      this.logger?.info(`MQTT disconnected for vehicle ${this.deviceData.id}`);
    });

    client.onError((error) => {
      this.logger?.error(`MQTT error for vehicle ${this.deviceData.id}: ${error.message}`);
    });

    client.onReconnect(() => {
      this.logger?.info(`MQTT reconnecting for vehicle ${this.deviceData.id}`);
    });

    client.onMessage((topic: string, message: StreamMessage) => {
      void this.handleMqttMessage(topic, message);
    });

    client.onStateChange((state: ConnectionState) => {
      this.handleMqttStateChange(client, state);
    });
  }

  /**
   * Translate a connection state change of the MQTT client into the stream state capability.
   *
   * Events of a client that has been replaced or disposed are ignored.
   *
   * @param client - The client that reported the change
   * @param state - The new connection state
   */
  private handleMqttStateChange(client: MqttStreamClient, state: ConnectionState): void {
    if (this._mqttClient !== client) {
      return;
    }

    this.logger?.debug(`MQTT connection state for vehicle ${this.deviceData.id}: ${state}`);
    void this.setStreamState(mapConnectionState(state, this.getStreamStateContext()));
  }

  /**
   * Schedule the next stream start attempt using exponential backoff
   * (30 s, 60 s, 120 s, 240 s, 480 s, then every 900 s) and show that the stream is recovering.
   */
  private async scheduleStreamRetry(): Promise<void> {
    if (this._streamRetryTimer) {
      this.homey.clearTimeout(this._streamRetryTimer);
    }

    const failedAttempts = (this._streamRetryAttempt ?? 0) + 1;
    this._streamRetryAttempt = failedAttempts;
    const delayMs = getStreamRetryDelayMs(failedAttempts);

    this.logger?.info(
      `Retrying MQTT streaming for vehicle ${this.deviceData.id} in ${delayMs / 1000} seconds (failed attempts: ${failedAttempts})`
    );
    this._streamRetryTimer = this.homey.setTimeout(() => {
      this._streamRetryTimer = undefined;
      void this.startMqttStream();
    }, delayMs);

    await this.setStreamState(StreamState.RECONNECTING);
  }

  /**
   * Cancel any pending stream start retry and abandon an in-flight attempt.
   *
   * Used when the device is deleted or uninitialised, streaming is turned off and when services
   * are re-initialised. Resets the backoff schedule.
   */
  private cancelStreamRetry(): void {
    this._streamGeneration = (this._streamGeneration ?? 0) + 1;
    if (this._streamRetryTimer) {
      this.homey.clearTimeout(this._streamRetryTimer);
      this._streamRetryTimer = undefined;
    }
    this._streamRetryAttempt = 0;
  }

  /**
   * Check whether a stream start attempt has been superseded since it began.
   *
   * @param generation - Generation captured when the attempt started
   */
  private isStreamAttemptCancelled(generation: number): boolean {
    return (this._streamGeneration ?? 0) !== generation;
  }

  /**
   * Start the stream watchdog: a Homey-managed interval that checks once a minute whether the
   * MQTT stream has silently stopped (see {@link runStreamWatchdog}).
   *
   * Replaces a running watchdog, so restarting the services never leaves two behind.
   */
  private startStreamWatchdog(): void {
    this.stopStreamWatchdog();
    this._streamWatchdogTimer = this.homey.setInterval(() => {
      this.runStreamWatchdog();
    }, STREAM_WATCHDOG_INTERVAL_MS);
  }

  /**
   * Stop the stream watchdog. Safe to call when it is not running.
   */
  private stopStreamWatchdog(): void {
    if (this._streamWatchdogTimer) {
      this.homey.clearInterval(this._streamWatchdogTimer);
      this._streamWatchdogTimer = undefined;
    }
  }

  /**
   * One tick of the stream watchdog.
   *
   * The MQTT client recovers by itself after an established connection drops, and a failed start
   * schedules its own retry. This catches what neither covers: a stream that is wanted but has no
   * client, or whose client is `disconnected` or in `error`, while no retry is pending and no
   * start attempt is running. In that case the stream is started again. In every other case
   * nothing happens.
   *
   * Never throws: a failing check must not stop the interval or break the device.
   */
  private runStreamWatchdog(): void {
    try {
      if (!this.isStreamFoundStopped()) {
        return;
      }

      this.logger?.warn('MQTT stream found stopped with no retry pending - restarting');
      void this.startMqttStream().catch((error: unknown) => {
        this.logStreamWatchdogError(error);
      });
    } catch (error) {
      this.logStreamWatchdogError(error);
    }
  }

  /**
   * Whether the stream is wanted and could be started, but nothing is running or scheduled.
   */
  private isStreamFoundStopped(): boolean {
    // Same effective setting as the stream code (see getStreamStateContext)
    const streamingEnabled = this._streamingEnabled ?? this.settings.streamingEnabled;
    if (!streamingEnabled) {
      return false;
    }

    if (!this._authProvider || !this.api) {
      return false;
    }

    // A scheduled retry or a running attempt will take care of it
    if (this._streamRetryTimer !== undefined) {
      return false;
    }
    if (this._streamAttemptGeneration === (this._streamGeneration ?? 0)) {
      return false;
    }

    const state = this._mqttClient?.getConnectionState();
    return state === undefined || state === 'disconnected' || state === 'error';
  }

  /**
   * Log a failure of a watchdog tick.
   *
   * @param error - The error that was caught
   */
  private logStreamWatchdogError(error: unknown): void {
    this.logger?.error(
      `MQTT stream watchdog failed for vehicle ${this.deviceData.id}`,
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Disconnect and forget the current MQTT client, ignoring disconnect errors.
   *
   * The client is forgotten first so its own state change events are ignored.
   */
  private async disposeMqttClient(): Promise<void> {
    const client = this._mqttClient;
    this._mqttClient = undefined;
    if (client) {
      await this.disconnectQuietly(client);
    }
  }

  /**
   * Disconnect an MQTT client and ignore any error.
   *
   * @param client - The client to disconnect
   */
  private async disconnectQuietly(client: MqttStreamClient): Promise<void> {
    try {
      await client.disconnect();
    } catch (error) {
      this.logger?.debug(
        `Ignoring MQTT disconnect error for vehicle ${this.deviceData.id}: ${String(error)}`
      );
    }
  }

  /**
   * Stop MQTT streaming because the user turned it off: cancel retries, show the stream as
   * disabled and disconnect the client.
   */
  private async stopMqttStreaming(): Promise<void> {
    this._streamingEnabled = false;
    this.cancelStreamRetry();
    await this.setStreamState(StreamState.DISABLED);
    await this.disposeMqttClient();
  }

  /**
   * Context for translating MQTT client states into stream states.
   */
  private getStreamStateContext(): StreamStateContext {
    return {
      streamingEnabled: this._streamingEnabled ?? this.settings.streamingEnabled,
      recovering: this._streamRetryTimer !== undefined || (this._streamRetryAttempt ?? 0) > 0,
    };
  }

  /**
   * Show the state of the MQTT stream in the `cardata_stream_state` capability and fire the
   * "Car data stream changed" trigger when the value changes.
   *
   * Duplicates are ignored. The very first value (no previous value known) is not a change and
   * does not fire the trigger. Never throws.
   *
   * @param next - The new stream state
   */
  private async setStreamState(next: StreamState): Promise<void> {
    const previous = this._streamState ?? this.readStreamStateCapability();
    this._streamState = next;
    if (previous === next) {
      return;
    }

    try {
      await this.setCapabilityValueSafe(Capabilities.CARDATA_STREAM_STATE, next);
    } catch (error) {
      if (this._streamState === next) {
        this._streamState = previous;
      }
      this.logger?.warn(
        `Failed to set stream state '${next}' for vehicle ${this.deviceData.id}: ${String(error)}`
      );
      return;
    }

    if (previous !== undefined) {
      await this.triggerStreamStateChanged(next);
    }
  }

  /**
   * Read the stream state currently stored in the capability (e.g. from before an app restart).
   */
  private readStreamStateCapability(): StreamState | undefined {
    if (!this.hasCapability(Capabilities.CARDATA_STREAM_STATE)) {
      return undefined;
    }
    const value: unknown = this.getCapabilityValue(Capabilities.CARDATA_STREAM_STATE);
    return isStreamState(value) ? value : undefined;
  }

  /**
   * Fire the "Car data stream changed" flow trigger.
   *
   * @param state - The new stream state
   */
  private async triggerStreamStateChanged(state: StreamState): Promise<void> {
    try {
      const card = this.homey.flow.getDeviceTriggerCard(Flows.STREAM_STATE_CHANGED);
      await card.trigger(this, { state: STREAM_STATE_TITLES[state] }, {});
    } catch (error) {
      this.logger?.error(
        `Failed to fire stream state changed trigger for vehicle ${this.deviceData.id}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check whether the MQTT stream is live right now, i.e. connected and delivering data.
   *
   * Used by the `car_data_stream_live` flow condition: while it is true, changes reach Homey
   * within seconds. Only the state of this process counts; the capability value left over from
   * before an app restart says nothing about the current stream.
   *
   * @returns True only when the stream state is `connected`
   */
  isCarDataStreamLive(): boolean {
    return this._streamState === StreamState.CONNECTED;
  }

  /**
   * Remember the time the car measured the newest data we just received (MQTT message or
   * successful REST poll). Not the time we received it: a message replayed after a reconnect or a
   * poll that returns hours-old values must not make the data look fresh.
   *
   * The value only moves forward: older data leaves the recorded time, the label and the store
   * untouched (the last recorded time is also read from the store, so this holds right after an
   * app restart). The data time is clamped to now, as BMW and Homey clocks can differ.
   *
   * Keeps the exact time in memory and persists it in the device store at most once a minute
   * (survives restarts, used by the `car_data_fresh` condition), and shows it in the
   * `cardata_last_update` capability in the Homey's timezone. Never throws: bookkeeping must not
   * break data handling.
   *
   * @param dataTimeMs - When the car measured the data (epoch ms, see resolveCarDataTimeMs)
   */
  private async recordCarDataUpdate(dataTimeMs: number): Promise<void> {
    try {
      const now = Date.now();
      const dataTime = Number.isFinite(dataTimeMs) ? Math.min(dataTimeMs, now) : now;

      // Never move backwards, unless the recorded time is ahead of the Homey clock: then the clock
      // stepped back (or the stored value is bogus) and keeping it would freeze the value until
      // the clock catches up
      const previous = this.getLastDataUpdateMs();
      if (previous !== undefined && previous <= now && dataTime < previous) {
        this.logger?.debug(
          `Ignoring car data older than the last recorded data for vehicle ${this.deviceData.id}`
        );
        return;
      }
      this._lastDataUpdateMs = dataTime;

      // Persist at most once a minute (by time of writing, not data time): messages can arrive
      // several times a second while driving. A clock that stepped back also persists straight away.
      const persistedAt = this._lastDataUpdatePersistedMs;
      if (
        persistedAt === undefined ||
        now < persistedAt ||
        now - persistedAt >= LAST_DATA_UPDATE_PERSIST_INTERVAL_MS
      ) {
        await this.setStoreValue(STORE_KEY_LAST_DATA_UPDATE, dataTime);
        this._lastDataUpdatePersistedMs = now;
      }

      const label = formatLastUpdate(dataTime, this.getHomeyTimeZone());
      if (label !== this._lastUpdateLabel) {
        await this.setCapabilityValueSafe(Capabilities.CARDATA_LAST_UPDATE, label);
        this._lastUpdateLabel = label;
      }
    } catch (error) {
      this.logger?.warn(
        `Failed to record last car data update for vehicle ${this.deviceData.id}: ${String(error)}`
      );
    }
  }

  /**
   * Get the Homey's timezone, or undefined (system default) when it cannot be determined.
   */
  private getHomeyTimeZone(): string | undefined {
    try {
      return this.homey.clock.getTimezone();
    } catch {
      return undefined;
    }
  }

  /**
   * Get the time the car measured the newest data we received (epoch ms).
   *
   * The in-memory time is the most recent; the store covers the time before an app restart.
   *
   * @returns Epoch milliseconds, or undefined when no car data was ever recorded
   */
  private getLastDataUpdateMs(): number | undefined {
    if (this._lastDataUpdateMs !== undefined) {
      return this._lastDataUpdateMs;
    }
    const stored: unknown = this.getStoreValue(STORE_KEY_LAST_DATA_UPDATE);
    return typeof stored === 'number' && Number.isFinite(stored) ? stored : undefined;
  }

  /**
   * Check whether the car's data is recent: the car measured it within the given number of minutes.
   *
   * Used by the `car_data_fresh` flow condition. This is the time the car measured the data, not
   * the time it arrived, so a replayed message or a poll with old values is not fresh. A device
   * that never received data is not fresh.
   *
   * @param minutes - Maximum age of the newest data, in minutes
   * @returns True when the newest data was measured within the last `minutes` minutes
   */
  isCarDataFresh(minutes: number): boolean {
    return isTimestampFresh(this.getLastDataUpdateMs(), minutes);
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

      // Real car data just arrived: remember when the car measured it
      await this.recordCarDataUpdate(resolveCarDataTimeMs(message.data, message.timestamp));

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
   * Validates prerequisites for starting API polling. Container availability
   * is NOT a prerequisite - the container is created lazily on the first
   * poll (see ensureContainer) so MQTT streaming can start immediately and
   * a failing container operation only delays the next polling cycle.
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

    return { canStart: true };
  }

  /**
   * Create a per-device ContainerManager. Mirrors the wiring in `app.ts`:
   * shared HttpClient, shared auth provider for the device's clientId.
   *
   * Protected and async to mirror the `createContainerManager` shape used in
   * the driver layer and to allow tests to override the import lazily.
   */
  protected async createContainerManager(): Promise<ContainerManager | undefined> {
    const clientId = this.stateManager.getClientId();
    if (!clientId || !this._authProvider) {
      return undefined;
    }

    const httpClient = this.app.createHttpClient();
    const authProvider = this._authProvider;
    const { ContainerManager: ContainerManagerCtor } = await import('../lib/api/ContainerManager');
    return new ContainerManagerCtor({
      httpClient,
      getAccessToken: async () => authProvider.getValidAccessToken(),
      logger: this.logger,
    });
  }

  /**
   * Lazily resolve the container ID used for API polling.
   *
   * Resolution order:
   * 1. If the device store already has a container ID (user-supplied or
   *    previously auto-created), return it - polling will discover staleness
   *    via a 404 on `getRawTelematicData` and clear it for the next cycle.
   * 2. Otherwise call ContainerManager.getOrCreateContainer, which handles
   *    list / orphan cleanup / create. The returned ID is persisted to both
   *    the device store and the user-visible setting.
   *
   * Returns `undefined` on any failure (rate-limit, network, auth). The
   * caller is expected to skip this poll and try again on the next cycle -
   * MQTT streaming is unaffected.
   */
  private async ensureContainer(): Promise<string | undefined> {
    const existing = this.stateManager.getContainerId();
    if (existing) {
      return existing;
    }

    const clientId = this.stateManager.getClientId();
    if (!clientId) {
      this.logger?.warn('Cannot create container - no client ID for this device');
      return undefined;
    }

    const containerManager = await this.createContainerManager();
    if (!containerManager) {
      this.logger?.warn('Cannot create container - container manager unavailable');
      return undefined;
    }

    // Per-GCID identifier; multiple vehicles under the same client share one container.
    const containerKey = `HOMEY-${clientId.substring(0, 8)}`;

    try {
      this.logger?.info(`Provisioning BMW container for client ${clientId.substring(0, 8)}…`);
      const newId = await containerManager.getOrCreateContainer(containerKey);
      await this.stateManager.setContainerId(newId);
      this.logger?.info(`Container provisioned: ${newId}`);
      return newId;
    } catch (error) {
      if (error instanceof RateLimitError) {
        this.logger?.warn(
          'Container provisioning hit BMW rate limit - will retry on next poll cycle'
        );
      } else {
        this.logger?.error(
          `Container provisioning failed - will retry on next poll cycle: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      return undefined;
    }
  }

  /**
   * Execute a single API poll
   *
   * Fetches raw telematic data from the API and updates the state manager cache.
   * Lazily provisions the container if one is not yet available, and clears a
   * stale container ID if the API returns 404 so the next cycle re-creates it.
   *
   * @private Extracted for testability
   */
  private async executePoll(): Promise<void> {
    try {
      if (!this.api) {
        this.logger?.warn('API client unavailable - skipping poll');
        return;
      }

      const containerId = await this.ensureContainer();
      if (!containerId) {
        // ensureContainer logged the specific reason; nothing more to do until
        // the next scheduled poll cycle.
        return;
      }

      this.logger?.debug(`Polling API for vehicle ${this.deviceData.id}`);

      let rawData;
      try {
        rawData = await this.api.getRawTelematicData(this.deviceData.id, containerId);
      } catch (pollError) {
        if (pollError instanceof ApiError && pollError.statusCode === 404) {
          // Container was deleted out from under us (manual cleanup, BMW-side
          // expiry, etc.). Drop the stored ID so the next cycle provisions a
          // fresh one. Power users can also override via the repair flow's
          // container_id field.
          this.logger?.warn(
            `Container ${containerId} returned 404 - clearing and recreating on next poll`
          );
          await this.stateManager.clearContainerId();
          return;
        }
        throw pollError;
      }

      // Update state manager cache with API data
      await this.stateManager.updateFromApi(rawData);

      // Real car data just arrived: remember when the car measured it
      await this.recordCarDataUpdate(resolveCarDataTimeMs(rawData));

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
  private startApiPolling(settingsOverride?: DeviceSettings): void {
    const settings = settingsOverride ?? this.settings;

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
      if (status.combustion.fuelLevelPercent !== undefined) {
        await this.setCapabilityValueSafe(
          Capabilities.FUEL_LEVEL_PERCENT,
          status.combustion.fuelLevelPercent
        );
      }

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

    // Car data health capabilities are available for all vehicles, before the drive train is known
    await this.addCapabilitySafe(Capabilities.CARDATA_STREAM_STATE);
    await this.addCapabilitySafe(Capabilities.CARDATA_LAST_UPDATE);

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
      await this.addCapabilitySafe(Capabilities.FUEL_LEVEL_PERCENT);
    } else {
      await this.removeCapabilitySafe(Capabilities.REMAINING_FUEL);
      await this.removeCapabilitySafe(Capabilities.FUEL_LEVEL_PERCENT);
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

      // Start or stop API polling based on current enabled state.
      // The new values are passed explicitly: Homey has not persisted them yet.
      if (settings.apiPollingEnabled) {
        this.startApiPolling(settings);
      } else {
        this.stopApiPolling();
      }
    }

    // Handle streaming enabled/disabled changes
    if (changedKeys.includes(nameOf<DeviceSettings>('streamingEnabled'))) {
      this.logger?.info(`MQTT streaming ${settings.streamingEnabled ? 'enabled' : 'disabled'}`);
      // Start or stop MQTT streaming. The new value is passed explicitly: Homey has not persisted it yet.
      if (settings.streamingEnabled) {
        await this.initializeMqttStreaming(settings);
      } else {
        await this.stopMqttStreaming();
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

    void this.stopBackgroundServices();
  }

  /**
   * onUninit is called when the device is destroyed (also after it was deleted) or the app stops.
   */
  async onUninit() {
    await this.stopBackgroundServices();
  }

  /**
   * Stop everything that keeps running in the background for this device: the stream watchdog,
   * stream start retries, the MQTT stream, API polling and the trip debounce timer.
   *
   * Idempotent, so it is safe to call from both onDeleted and onUninit.
   */
  private async stopBackgroundServices(): Promise<void> {
    // Stop the watchdog first so it cannot restart the stream while we are shutting it down
    this.stopStreamWatchdog();

    // Cancel pending stream start retries (and abandon an in-flight attempt)
    this.cancelStreamRetry();

    // Stop API polling
    this.stopApiPolling();

    // Clear trip debounce timer
    if (this._tripDebounceTimer) {
      clearTimeout(this._tripDebounceTimer);
      this._tripDebounceTimer = undefined;
    }

    // Stop MQTT streaming
    const client = this._mqttClient;
    this._mqttClient = undefined;
    if (client) {
      try {
        await client.disconnect();
        this.logger?.info('MQTT client disconnected successfully');
      } catch (error) {
        this.logger?.error(`Error disconnecting MQTT client: ${String(error)}`);
      }
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
