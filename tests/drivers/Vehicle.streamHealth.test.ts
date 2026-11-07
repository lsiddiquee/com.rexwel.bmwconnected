/**
 * Vehicle stream health tests
 *
 * Covers the reliability features around the MQTT stream:
 * - retry of the initial stream start with exponential backoff
 * - the `cardata_stream_state` capability and the "Car data stream changed" trigger
 * - the `cardata_last_update` capability (time the CAR measured the data) and the `car_data_fresh`
 *   condition support
 * - the stream watchdog and the `car_data_stream_live` condition support
 * - migration of the new capabilities to existing devices
 */

jest.mock('geolocation-utils');
jest.mock('../../lib/streaming/MqttStreamClient');

import { Vehicle } from '../../drivers/Vehicle';
import { MqttStreamClient } from '../../lib/streaming/MqttStreamClient';
import type { ConnectionState } from '../../lib/streaming/IMqttClient';
import type { StreamMessage } from '../../lib/streaming/StreamMessage';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { Capabilities } from '../../utils/Capabilities';
import { Flows } from '../../utils/Flows';
import { STORE_KEY_LAST_DATA_UPDATE } from '../../utils/StoreKeys';
import { createHomeyTimers, createMockedVehicle } from '../helpers/vehicleTestHelper';

interface FakeMqttClient {
  connect: jest.Mock;
  subscribe: jest.Mock;
  disconnect: jest.Mock;
  getConnectionState: jest.Mock;
  onConnect: jest.Mock;
  onDisconnect: jest.Mock;
  onError: jest.Mock;
  onReconnect: jest.Mock;
  onMessage: jest.Mock;
  onStateChange: jest.Mock;
  emitState: (state: ConnectionState) => void;
}

const NOW = new Date('2026-11-04T13:32:00Z');

describe('Vehicle stream health', () => {
  let vehicle: Vehicle;
  let mockLogger: any;
  let mockSettings: any;
  let mockStateManager: any;
  let triggerCard: { trigger: jest.Mock };
  let clients: FakeMqttClient[];
  let connectImpl: jest.Mock;
  let capabilities: Map<string, unknown>;
  let store: Map<string, unknown>;

  const createFakeClient = (): FakeMqttClient => {
    let stateHandler: ((state: ConnectionState) => void) | undefined;
    // The real client starts out 'disconnected'
    let connectionState: ConnectionState = 'disconnected';
    const client: FakeMqttClient = {
      connect: jest.fn(() => connectImpl(client)),
      subscribe: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getConnectionState: jest.fn(() => connectionState),
      onConnect: jest.fn(),
      onDisconnect: jest.fn(),
      onError: jest.fn(),
      onReconnect: jest.fn(),
      onMessage: jest.fn(),
      onStateChange: jest.fn((handler: (state: ConnectionState) => void) => {
        stateHandler = handler;
      }),
      emitState: (state) => {
        connectionState = state;
        stateHandler?.(state);
      },
    };
    return client;
  };

  /** Let all pending promise callbacks run (fake timers do not stop microtasks). */
  const settle = () => jest.advanceTimersByTimeAsync(0);

  const streamState = () => capabilities.get(Capabilities.CARDATA_STREAM_STATE);
  const lastUpdate = () => capabilities.get(Capabilities.CARDATA_LAST_UPDATE);
  const streamStateWrites = () =>
    (vehicle.setCapabilityValue as jest.Mock).mock.calls
      .filter(([id]) => id === Capabilities.CARDATA_STREAM_STATE)
      .map(([, value]) => value);

  /** A connect() that fails the way the real client does: it reports 'error' and then throws. */
  const failingConnect = (client: FakeMqttClient): Promise<void> => {
    client.emitState('connecting');
    client.emitState('error');
    return Promise.reject(new Error('connect failed'));
  };

  /** A connect() that succeeds and reports the states of a healthy client. */
  const connectsAndReports = (client: FakeMqttClient): Promise<void> => {
    client.emitState('connecting');
    client.emitState('connected');
    return Promise.resolve();
  };

  const setStreamingSettingInStore = (enabled: boolean) => {
    mockSettings.streamingEnabled = enabled;
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });

    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockLogger = result.mocks.mockLogger;
    mockSettings = result.mocks.mockSettings;

    capabilities = new Map();
    store = new Map();
    clients = [];
    connectImpl = jest.fn().mockResolvedValue(undefined);
    triggerCard = { trigger: jest.fn().mockResolvedValue(undefined) };

    (MqttStreamClient as unknown as jest.Mock).mockImplementation(() => {
      const client = createFakeClient();
      clients.push(client);
      return client;
    });

    // Homey-managed timers: spies that delegate to the global timers, so fake timers drive them
    const timers = createHomeyTimers();
    vehicle.homey = {
      app: result.mocks.mockApp,
      version: '12.5.0',
      clock: { getTimezone: jest.fn().mockReturnValue('Europe/Amsterdam') },
      flow: { getDeviceTriggerCard: jest.fn().mockReturnValue(triggerCard) },
      setTimeout: jest.fn(timers.setTimeout),
      clearTimeout: jest.fn(timers.clearTimeout),
      setInterval: jest.fn(timers.setInterval),
      clearInterval: jest.fn(timers.clearInterval),
    } as any;

    vehicle.hasCapability = jest.fn((id: string) => capabilities.has(id));
    vehicle.addCapability = jest.fn((id: string) => {
      capabilities.set(id, null);
      return Promise.resolve();
    });
    vehicle.setCapabilityValue = jest.fn((id: string, value: unknown) => {
      capabilities.set(id, value);
      return Promise.resolve();
    });
    vehicle.getCapabilityValue = jest.fn((id: string) => capabilities.get(id)) as any;
    vehicle.getStoreValue = jest.fn((key: string) => store.get(key));
    vehicle.setStoreValue = jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    });

    mockStateManager = {
      updateFromMqttMessage: jest.fn(),
      updateFromApi: jest.fn().mockResolvedValue(undefined),
      getContainerId: jest.fn().mockReturnValue('container-1'),
      getClientId: jest.fn().mockReturnValue('client-1'),
      getDriveTrain: jest.fn().mockReturnValue(DriveTrainType.ELECTRIC),
      getLastLocation: jest.fn().mockReturnValue(null),
      getLastFlowTriggeredLocation: jest.fn().mockReturnValue(null),
    };
    vehicle['stateManager'] = mockStateManager;
    vehicle['_authProvider'] = { getAccessToken: jest.fn() } as any;
    vehicle['_carDataClient'] = {
      getRawTelematicData: jest.fn().mockResolvedValue({ 'vehicle.a': {} }),
    } as any;
  });

  afterEach(() => {
    vehicle['cancelStreamRetry']();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('initial stream start retry', () => {
    it('should_retryAfter30Seconds_when_initialConnectFails', async () => {
      connectImpl.mockImplementation(failingConnect);

      await vehicle['initializeMqttStreaming']();
      expect(clients).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(29_999);
      expect(clients).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(clients).toHaveLength(2);
    });

    it('should_keepExistingErrorLog_when_initialConnectFails', async () => {
      const error = new Error('connect failed');
      connectImpl.mockRejectedValue(error);

      await vehicle['initializeMqttStreaming']();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize MQTT streaming for vehicle TEST_VIN_123 - will use API polling',
        error
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Retrying MQTT streaming for vehicle TEST_VIN_123 in 30 seconds (failed attempts: 1)'
      );
    });

    it('should_useExponentialBackoffThenCapAt900Seconds_when_everyAttemptFails', async () => {
      connectImpl.mockImplementation(failingConnect);
      await vehicle['initializeMqttStreaming']();

      const delaysInSeconds = [30, 60, 120, 240, 480, 900, 900, 900];
      let expectedClients = 1;
      for (const seconds of delaysInSeconds) {
        await jest.advanceTimersByTimeAsync(seconds * 1000 - 1);
        expect(clients).toHaveLength(expectedClients);
        await jest.advanceTimersByTimeAsync(1);
        expectedClients += 1;
        expect(clients).toHaveLength(expectedClients);
      }
    });

    it('should_retryAndStop_when_subscribeFailsThenSucceeds', async () => {
      const subscribeError = new Error('subscribe failed');
      connectImpl.mockImplementation((client: FakeMqttClient) => {
        client.subscribe.mockRejectedValueOnce(subscribeError);
        return Promise.resolve();
      });

      await vehicle['initializeMqttStreaming']();
      expect(clients).toHaveLength(1);
      expect(jest.getTimerCount()).toBe(1);

      // Second attempt: subscribe works
      connectImpl.mockResolvedValue(undefined);
      await jest.advanceTimersByTimeAsync(30_000);

      expect(clients).toHaveLength(2);
      expect(clients[1].subscribe).toHaveBeenCalledWith('TEST_VIN_123');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_resetBackoffAndStopRetrying_when_retrySucceeds', async () => {
      connectImpl
        .mockImplementationOnce(failingConnect)
        .mockImplementationOnce(failingConnect)
        .mockResolvedValue(undefined);

      await vehicle['initializeMqttStreaming']();
      await jest.advanceTimersByTimeAsync(30_000); // second attempt fails -> 60 s
      await jest.advanceTimersByTimeAsync(60_000); // third attempt succeeds

      expect(clients).toHaveLength(3);
      expect(vehicle['_streamRetryAttempt']).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MQTT streaming initialized for vehicle TEST_VIN_123'
      );

      // The next failure starts the schedule over at 30 s
      connectImpl.mockImplementation(failingConnect);
      await vehicle['startMqttStream']();
      expect(clients).toHaveLength(4);
      await jest.advanceTimersByTimeAsync(29_999);
      expect(clients).toHaveLength(4);
      await jest.advanceTimersByTimeAsync(1);
      expect(clients).toHaveLength(5);
    });

    it('should_disposePreviousClientAndCreateFreshOne_when_retrying', async () => {
      connectImpl.mockImplementationOnce(failingConnect).mockResolvedValue(undefined);

      await vehicle['initializeMqttStreaming']();
      const failedClient = clients[0];

      await jest.advanceTimersByTimeAsync(30_000);

      expect(failedClient.disconnect).toHaveBeenCalled();
      expect(clients).toHaveLength(2);
      expect(clients[1]).not.toBe(failedClient);
      expect(vehicle['_mqttClient']).toBe(clients[1]);
    });

    it('should_disposeClientBeforeCreatingTheNextOne_when_attemptStarts', async () => {
      const previous = createFakeClient();
      vehicle['_mqttClient'] = previous as any;

      await vehicle['startMqttStream']();

      expect(previous.disconnect).toHaveBeenCalledTimes(1);
      expect(clients).toHaveLength(1);
      expect(vehicle['_mqttClient']).toBe(clients[0]);
    });

    it('should_ignoreDisconnectErrors_when_disposingPreviousClient', async () => {
      const previous = createFakeClient();
      previous.disconnect.mockRejectedValue(new Error('already closed'));
      vehicle['_mqttClient'] = previous as any;

      await expect(vehicle['startMqttStream']()).resolves.toBeUndefined();

      expect(clients).toHaveLength(1);
    });
  });

  describe('retry cancellation', () => {
    beforeEach(async () => {
      connectImpl.mockImplementation(failingConnect);
      await vehicle['initializeMqttStreaming']();
      expect(jest.getTimerCount()).toBe(1);
    });

    it('should_cancelRetry_when_deviceDeleted', async () => {
      vehicle.onDeleted();

      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(3_600_000);
      expect(clients).toHaveLength(1);
    });

    it('should_cancelRetry_when_deviceUninitialised', async () => {
      await vehicle.onUninit();

      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(3_600_000);
      expect(clients).toHaveLength(1);
    });

    it('should_cancelRetryAndShowDisabled_when_streamingTurnedOffInSettings', async () => {
      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: false },
        changedKeys: ['streamingEnabled'],
      });

      expect(jest.getTimerCount()).toBe(0);
      expect(streamState()).toBe('disabled');
      await jest.advanceTimersByTimeAsync(3_600_000);
      expect(clients).toHaveLength(1);
    });

    it('should_cancelOldRetryAndStartFresh_when_servicesReinitialised', async () => {
      jest.spyOn(vehicle as any, 'initializeCarDataClient').mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'startApiPolling').mockImplementation(() => {});
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});

      await jest.advanceTimersByTimeAsync(10_000);
      connectImpl.mockImplementation(connectsAndReports);
      await vehicle.initializeVehicleDataAndServices();

      // Re-init immediately started a fresh attempt, which succeeded: no retry is left, only the
      // stream watchdog keeps running
      expect(clients).toHaveLength(2);
      expect(vehicle['_streamRetryTimer']).toBeUndefined();
      expect(jest.getTimerCount()).toBe(1);

      // The old retry (due at t=30s) never fires
      await jest.advanceTimersByTimeAsync(3_600_000);
      expect(clients).toHaveLength(2);
    });

    it('should_notDoubleUpRetries_when_reinitialisedWhileStillFailing', async () => {
      jest.spyOn(vehicle as any, 'initializeCarDataClient').mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'startApiPolling').mockImplementation(() => {});
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});

      await jest.advanceTimersByTimeAsync(10_000);
      await vehicle.initializeVehicleDataAndServices(); // fails again -> new 30 s timer
      expect(clients).toHaveLength(2);
      // One retry timer (the old one was replaced) plus the stream watchdog
      expect(jest.getTimerCount()).toBe(2);

      // Old timer would have fired at t=30s (20 s from now); the new one fires at t=40s
      await jest.advanceTimersByTimeAsync(29_999);
      expect(clients).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(clients).toHaveLength(3);
    });

    it('should_startFreshAndRestartBackoff_when_streamingReEnabledInSettings', async () => {
      await jest.advanceTimersByTimeAsync(30_000); // second attempt fails -> next delay 60 s
      expect(clients).toHaveLength(2);

      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: false },
        changedKeys: ['streamingEnabled'],
      });
      connectImpl.mockImplementation(failingConnect);
      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: true },
        changedKeys: ['streamingEnabled'],
      });
      expect(clients).toHaveLength(3);

      await jest.advanceTimersByTimeAsync(29_999);
      expect(clients).toHaveLength(3);
      await jest.advanceTimersByTimeAsync(1);
      expect(clients).toHaveLength(4);
    });
  });

  describe('concurrent attempts', () => {
    it('should_notStartSecondAttempt_when_oneIsInFlight', async () => {
      let resolveConnect: () => void = () => {};
      connectImpl.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          })
      );

      const first = vehicle['startMqttStream']();
      const second = vehicle['startMqttStream']();
      await second;
      await settle();

      expect(clients).toHaveLength(1);
      expect(connectImpl).toHaveBeenCalledTimes(1);

      resolveConnect();
      await first;
      expect(clients[0].subscribe).toHaveBeenCalledTimes(1);
    });

    it('should_allowNewAttemptAfterCompletion_when_previousAttemptFinished', async () => {
      await vehicle['startMqttStream']();
      await vehicle['startMqttStream']();

      expect(clients).toHaveLength(2);
    });

    it('should_abandonInFlightAttempt_when_cancelledWhileConnecting', async () => {
      let resolveConnect: () => void = () => {};
      connectImpl.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          })
      );
      const attempt = vehicle['startMqttStream']();
      await settle();

      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: false },
        changedKeys: ['streamingEnabled'],
      });
      resolveConnect();
      await attempt;

      expect(clients[0].subscribe).not.toHaveBeenCalled();
      expect(clients[0].disconnect).toHaveBeenCalled();
      expect(vehicle['_mqttClient']).toBeUndefined();
      expect(jest.getTimerCount()).toBe(0);
      expect(streamState()).toBe('disabled');
    });

    it('should_notScheduleRetry_when_cancelledAttemptFails', async () => {
      let rejectConnect: (error: Error) => void = () => {};
      connectImpl.mockImplementation(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectConnect = reject;
          })
      );
      const attempt = vehicle['startMqttStream']();
      await settle();

      vehicle.onDeleted();
      rejectConnect(new Error('late failure'));
      await attempt;

      expect(jest.getTimerCount()).toBe(0);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should_notClobberNewerClient_when_orphanedAttemptSettlesLater', async () => {
      const resolvers: Array<() => void> = [];
      connectImpl.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          })
      );

      const orphan = vehicle['startMqttStream']();
      await settle();
      const replacement = vehicle['initializeMqttStreaming']();
      await settle();
      await settle();

      expect(clients).toHaveLength(2);

      resolvers[1]();
      await replacement;
      resolvers[0]();
      await orphan;

      expect(vehicle['_mqttClient']).toBe(clients[1]);
      expect(clients[0].subscribe).not.toHaveBeenCalled();
      expect(clients[1].subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('cardata_stream_state capability', () => {
    it('should_registerStateChangeHandler_when_clientCreated', async () => {
      await vehicle['initializeMqttStreaming']();

      expect(clients[0].onStateChange).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['connected', 'connected'],
      ['connecting', 'connecting'],
      ['reconnecting', 'reconnecting'],
    ] as Array<[ConnectionState, string]>)(
      'should_map_%s_clientState_to_%s_capability',
      async (clientState, expected) => {
        await vehicle['initializeMqttStreaming']();

        // Move away from the value the start itself sets, then drive the client
        clients[0].emitState(clientState === 'connected' ? 'reconnecting' : 'connected');
        clients[0].emitState(clientState);
        await settle();

        expect(streamState()).toBe(expected);
      }
    );

    it('should_showConnecting_when_firstAttemptStarts', async () => {
      connectImpl.mockImplementation(() => new Promise<void>(() => {}));

      void vehicle['initializeMqttStreaming']();
      await settle();
      await settle();

      expect(streamState()).toBe('connecting');
    });

    it('should_showReconnecting_when_connectErrorAndRetryIsScheduled', async () => {
      connectImpl.mockImplementation(failingConnect);

      await vehicle['initializeMqttStreaming']();

      expect(jest.getTimerCount()).toBe(1);
      expect(streamState()).toBe('reconnecting');
      expect(streamStateWrites()).toEqual(['connecting', 'reconnecting']);
    });

    it('should_notFlipBackToConnecting_when_retryAttemptStarts', async () => {
      connectImpl.mockImplementation(failingConnect);
      await vehicle['initializeMqttStreaming']();

      await jest.advanceTimersByTimeAsync(30_000);

      expect(streamStateWrites()).toEqual(['connecting', 'reconnecting']);
      expect(streamState()).toBe('reconnecting');
    });

    it('should_showConnected_when_retrySucceeds', async () => {
      connectImpl.mockImplementationOnce(failingConnect).mockImplementation((c: FakeMqttClient) => {
        c.emitState('connecting');
        c.emitState('connected');
        return Promise.resolve();
      });
      await vehicle['initializeMqttStreaming']();

      await jest.advanceTimersByTimeAsync(30_000);

      expect(streamState()).toBe('connected');
    });

    it('should_writeEachChangeOnce_when_sameStateIsReportedRepeatedly', async () => {
      await vehicle['initializeMqttStreaming']();

      clients[0].emitState('connected');
      clients[0].emitState('connected'); // duplicate
      await settle();
      clients[0].emitState('reconnecting');
      await settle();
      clients[0].emitState('reconnecting'); // duplicate
      clients[0].emitState('connected');
      await settle();

      expect(streamStateWrites()).toEqual(['connecting', 'connected', 'reconnecting', 'connected']);
    });

    it('should_writeNewState_when_differsFromValueStoredBeforeRestart', async () => {
      capabilities.set(Capabilities.CARDATA_STREAM_STATE, 'connected');

      await vehicle['initializeMqttStreaming']();

      expect(streamStateWrites()).toEqual(['connecting']);
      expect(streamState()).toBe('connecting');
    });

    it('should_notRewrite_when_stateEqualsValueStoredBeforeRestart', async () => {
      capabilities.set(Capabilities.CARDATA_STREAM_STATE, 'disabled');
      setStreamingSettingInStore(false);

      await vehicle['initializeMqttStreaming']();

      expect(streamStateWrites()).toEqual([]);
      expect(streamState()).toBe('disabled');
    });

    it('should_showReconnecting_when_clientDisconnectsWhileRetryPending', async () => {
      connectImpl.mockImplementation(failingConnect);
      (MqttStreamClient as unknown as jest.Mock).mockImplementation(() => {
        const client = createFakeClient();
        // The real client reports 'disconnected' once its owner disconnects it
        client.disconnect.mockImplementation(() => {
          client.emitState('disconnected');
          return Promise.resolve();
        });
        clients.push(client);
        return client;
      });

      await vehicle['initializeMqttStreaming']();
      await settle();

      expect(streamState()).toBe('reconnecting');
      expect(streamStateWrites()).toEqual(['connecting', 'reconnecting']);
    });

    it('should_showDisabledNotUnavailable_when_userTurnsStreamingOffAndClientReportsDisconnected', async () => {
      (MqttStreamClient as unknown as jest.Mock).mockImplementation(() => {
        const client = createFakeClient();
        // The real client reports 'disconnected' once its owner disconnects it
        client.disconnect.mockImplementation(() => {
          client.emitState('disconnected');
          return Promise.resolve();
        });
        clients.push(client);
        return client;
      });
      await vehicle['initializeMqttStreaming']();
      clients[0].emitState('connected');
      await settle();

      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: false },
        changedKeys: ['streamingEnabled'],
      });
      await settle();

      expect(clients[0].disconnect).toHaveBeenCalled();
      expect(streamState()).toBe('disabled');
      expect(streamStateWrites()).not.toContain('unavailable');
    });

    it('should_showUnavailable_when_clientDisconnectsAndNothingWillRetry', async () => {
      await vehicle['initializeMqttStreaming']();
      clients[0].emitState('connected');
      await settle();

      clients[0].emitState('disconnected');
      await settle();

      expect(streamState()).toBe('unavailable');
    });

    it('should_showDisabled_when_streamingOffInSettingsAtStartup', async () => {
      setStreamingSettingInStore(false);

      await vehicle['initializeMqttStreaming']();

      expect(clients).toHaveLength(0);
      expect(streamState()).toBe('disabled');
    });

    it('should_showUnavailable_when_noAuthProvider', async () => {
      vehicle['_authProvider'] = undefined;

      await vehicle['initializeMqttStreaming']();

      expect(clients).toHaveLength(0);
      expect(streamState()).toBe('unavailable');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_showUnavailable_when_noApiClientAndStreamingEnabled', async () => {
      vehicle['_carDataClient'] = undefined;
      jest.spyOn(vehicle as any, 'initializeCarDataClient').mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});

      await vehicle.initializeVehicleDataAndServices();

      expect(clients).toHaveLength(0);
      expect(streamState()).toBe('unavailable');
    });

    it('should_showDisabled_when_noApiClientAndStreamingDisabled', async () => {
      setStreamingSettingInStore(false);
      vehicle['_carDataClient'] = undefined;
      jest.spyOn(vehicle as any, 'initializeCarDataClient').mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});

      await vehicle.initializeVehicleDataAndServices();

      expect(streamState()).toBe('disabled');
    });

    it('should_startStreamingUsingNewSetting_when_enabledInSettings', async () => {
      // Homey still reports the old (disabled) value while onSettings runs
      setStreamingSettingInStore(false);

      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: true },
        changedKeys: ['streamingEnabled'],
      });

      expect(clients).toHaveLength(1);
      expect(clients[0].connect).toHaveBeenCalled();
      expect(streamState()).toBe('connecting');
    });

    it('should_showDisabled_when_streamingTurnedOffInSettings', async () => {
      await vehicle['initializeMqttStreaming']();
      clients[0].emitState('connected');
      await settle();
      expect(streamState()).toBe('connected');

      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: false },
        changedKeys: ['streamingEnabled'],
      });

      expect(streamState()).toBe('disabled');
      expect(clients[0].disconnect).toHaveBeenCalled();
    });

    it('should_ignoreStateChanges_when_eventComesFromReplacedClient', async () => {
      connectImpl.mockImplementationOnce(failingConnect).mockResolvedValue(undefined);
      await vehicle['initializeMqttStreaming']();
      await jest.advanceTimersByTimeAsync(30_000);
      clients[1].emitState('connected');
      await settle();
      expect(streamState()).toBe('connected');

      clients[0].emitState('reconnecting');
      await settle();

      expect(streamState()).toBe('connected');
    });

    it('should_notThrow_when_settingTheCapabilityFails', async () => {
      (vehicle.setCapabilityValue as jest.Mock).mockRejectedValue(new Error('capability gone'));

      await expect(vehicle['initializeMqttStreaming']()).resolves.toBeUndefined();

      expect(clients).toHaveLength(1);
    });
  });

  describe('stream_state_changed trigger', () => {
    it('should_fireOncePerChange_when_stateChangesRepeatedly', async () => {
      await vehicle['initializeMqttStreaming'](); // sets 'connecting' (first value, no trigger)

      clients[0].emitState('connected');
      clients[0].emitState('connected'); // duplicate
      await settle();
      clients[0].emitState('reconnecting');
      await settle();
      clients[0].emitState('reconnecting'); // duplicate
      clients[0].emitState('connected');
      await settle();

      const tokens = triggerCard.trigger.mock.calls.map(([, tokens]) => tokens);
      expect(tokens).toEqual([{ state: 'Live' }, { state: 'Reconnecting' }, { state: 'Live' }]);
    });

    it('should_passDeviceAndEnglishTitleToken_when_triggered', async () => {
      await vehicle['initializeMqttStreaming']();

      clients[0].emitState('connected');
      await settle();

      expect(vehicle.homey.flow.getDeviceTriggerCard).toHaveBeenCalledWith(
        Flows.STREAM_STATE_CHANGED
      );
      expect(triggerCard.trigger).toHaveBeenCalledWith(vehicle, { state: 'Live' }, {});
    });

    it('should_notFire_when_firstEverStateIsSet', async () => {
      await vehicle['initializeMqttStreaming']();

      expect(streamState()).toBe('connecting');
      expect(triggerCard.trigger).not.toHaveBeenCalled();
    });

    it('should_fire_when_stateDiffersFromValueStoredBeforeRestart', async () => {
      capabilities.set(Capabilities.CARDATA_STREAM_STATE, 'connected');

      await vehicle['initializeMqttStreaming']();

      expect(triggerCard.trigger).toHaveBeenCalledWith(vehicle, { state: 'Connecting' }, {});
    });

    it('should_notFire_when_stateEqualsValueStoredBeforeRestart', async () => {
      capabilities.set(Capabilities.CARDATA_STREAM_STATE, 'disabled');
      setStreamingSettingInStore(false);

      await vehicle['initializeMqttStreaming']();

      expect(triggerCard.trigger).not.toHaveBeenCalled();
    });

    it('should_fire_when_streamingTurnedOffInSettings', async () => {
      await vehicle['initializeMqttStreaming']();
      clients[0].emitState('connected');
      await settle();
      triggerCard.trigger.mockClear();

      await vehicle.onSettings({
        newSettings: { ...mockSettings, streamingEnabled: false },
        changedKeys: ['streamingEnabled'],
      });

      expect(triggerCard.trigger).toHaveBeenCalledTimes(1);
      expect(triggerCard.trigger).toHaveBeenCalledWith(vehicle, { state: 'Off' }, {});
    });

    it('should_logAndContinue_when_triggerFails', async () => {
      triggerCard.trigger.mockRejectedValue(new Error('flow engine down'));
      await vehicle['initializeMqttStreaming']();

      clients[0].emitState('connected');
      await settle();
      await settle();

      expect(streamState()).toBe('connected');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('stream state changed trigger'),
        expect.any(Error)
      );
    });
  });

  /** Build a stream message. `pointTimestamps` are the times the car measured each value. */
  const mqttMessage = (messageTimestamp: string, pointTimestamps: string[] = []): StreamMessage =>
    ({
      vin: 'TEST_VIN_123',
      entityId: 'entity-1',
      topic: 'gcid/TEST_VIN_123',
      timestamp: messageTimestamp,
      data: Object.fromEntries(
        pointTimestamps.map((timestamp, i) => [`vehicle.key${i}`, { timestamp, value: i }])
      ),
    }) as unknown as StreamMessage;

  /** A message carrying one value the car measured at `iso`. */
  const messageMeasuredAt = (iso: string): StreamMessage => mqttMessage(iso, [iso]);

  /** A message carrying a value the car measured right now (fake time). */
  const messageNow = (): StreamMessage => messageMeasuredAt(new Date().toISOString());

  const handleMessage = (message: StreamMessage) =>
    vehicle['handleMqttMessage']('gcid/TEST_VIN_123', message);

  const storeWrites = () =>
    (vehicle.setStoreValue as jest.Mock).mock.calls.filter(
      ([key]) => key === STORE_KEY_LAST_DATA_UPDATE
    );
  const labelWrites = () =>
    (vehicle.setCapabilityValue as jest.Mock).mock.calls.filter(
      ([id]) => id === Capabilities.CARDATA_LAST_UPDATE
    );

  /** Make the next REST poll return values with the given measurement timestamps. */
  const pollReturns = (...timestamps: string[]) => {
    (vehicle['_carDataClient'] as any).getRawTelematicData.mockResolvedValue(
      Object.fromEntries(
        timestamps.map((timestamp, i) => [`vehicle.key${i}`, { timestamp, value: i }])
      )
    );
  };

  describe('cardata_last_update capability', () => {
    it('should_recordFormattedTimeInHomeyTimezoneAndEpoch_when_mqttMessageHandled', async () => {
      await handleMessage(messageNow());

      expect(lastUpdate()).toBe('4 Nov, 14:32');
      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      expect(vehicle.homey.clock.getTimezone).toHaveBeenCalled();
    });

    it('should_updateAgain_when_laterMessageArrives', async () => {
      await handleMessage(messageNow());

      jest.setSystemTime(new Date('2026-11-04T15:05:00Z'));
      await handleMessage(messageNow());

      expect(lastUpdate()).toBe('4 Nov, 16:05');
      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T15:05:00Z'));
    });

    it('should_notRewriteCapability_when_displayedMinuteUnchanged', async () => {
      await handleMessage(messageNow());
      const writesAfterFirst = (vehicle.setCapabilityValue as jest.Mock).mock.calls.length;

      jest.setSystemTime(new Date(NOW.getTime() + 5_000));
      await handleMessage(messageNow());

      expect((vehicle.setCapabilityValue as jest.Mock).mock.calls).toHaveLength(writesAfterFirst);
    });

    it('should_persistTimestampAtMostOncePerMinute_when_messagesArriveQuickly', async () => {
      await handleMessage(messageNow());
      jest.setSystemTime(new Date(NOW.getTime() + 5_000));
      await handleMessage(messageNow());
      jest.setSystemTime(new Date(NOW.getTime() + 59_000));
      await handleMessage(messageNow());

      expect(storeWrites()).toHaveLength(1);
      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());

      jest.setSystemTime(new Date(NOW.getTime() + 60_000));
      await handleMessage(messageNow());

      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime() + 60_000);
    });

    it('should_retryPersisting_when_previousStoreWriteFailed', async () => {
      (vehicle.setStoreValue as jest.Mock).mockRejectedValueOnce(new Error('disk busy'));
      await handleMessage(messageNow());

      jest.setSystemTime(new Date(NOW.getTime() + 5_000));
      await handleMessage(messageNow());

      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime() + 5_000);
    });

    it('should_recordTime_when_apiPollSucceeds', async () => {
      await vehicle['executePoll']();

      expect(mockStateManager.updateFromApi).toHaveBeenCalled();
      expect(lastUpdate()).toBe('4 Nov, 14:32');
      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
    });

    it('should_notRecordTime_when_apiPollFails', async () => {
      mockStateManager.updateFromApi.mockRejectedValue(new Error('429'));

      await vehicle['executePoll']();

      expect(lastUpdate()).toBeUndefined();
      expect(store.has(STORE_KEY_LAST_DATA_UPDATE)).toBe(false);
    });

    it('should_notRecordTime_when_rawDataFetchFails', async () => {
      (vehicle['_carDataClient'] as any).getRawTelematicData.mockRejectedValue(new Error('500'));

      await vehicle['executePoll']();

      expect(lastUpdate()).toBeUndefined();
      expect(store.has(STORE_KEY_LAST_DATA_UPDATE)).toBe(false);
    });

    it('should_notRecordTime_when_mqttMessageCannotBeApplied', async () => {
      mockStateManager.updateFromMqttMessage.mockImplementation(() => {
        throw new Error('bad message');
      });

      await handleMessage(messageNow());

      expect(lastUpdate()).toBeUndefined();
      expect(store.has(STORE_KEY_LAST_DATA_UPDATE)).toBe(false);
    });

    it('should_notRecordTime_when_cachedStateIsRestoredAtStartup', async () => {
      await vehicle['updateCapabilitiesFromStatus']({
        vin: 'TEST_VIN_123',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
        currentMileage: 1234,
      } as any);

      expect(lastUpdate()).toBeUndefined();
      expect(store.has(STORE_KEY_LAST_DATA_UPDATE)).toBe(false);
    });

    it('should_fallBackToIsoString_when_timezoneIsInvalid', async () => {
      (vehicle.homey.clock.getTimezone as jest.Mock).mockReturnValue('Not/AZone');

      await handleMessage(messageNow());

      expect(lastUpdate()).toBe(NOW.toISOString());
    });

    it('should_stillFormat_when_homeyClockIsUnavailable', async () => {
      (vehicle.homey as any).clock = undefined;

      await handleMessage(messageNow());

      expect(typeof lastUpdate()).toBe('string');
      expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
    });

    it('should_keepHandlingMessage_when_storeWriteFails', async () => {
      (vehicle.setStoreValue as jest.Mock).mockRejectedValue(new Error('disk full'));
      const debounceSpy = jest
        .spyOn(vehicle as any, 'checkAndDebounceTripCompletion')
        .mockResolvedValue(undefined);
      const message = messageNow();

      await handleMessage(message);

      expect(mockStateManager.updateFromMqttMessage).toHaveBeenCalledWith(message);
      expect(debounceSpy).toHaveBeenCalledWith(message);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to record last car data update')
      );
    });
  });

  describe('car data time (when the car measured the data)', () => {
    describe('MQTT messages', () => {
      it('should_recordNewestPointTimestamp_when_messageHasPointTimestamps', async () => {
        const message = mqttMessage('2026-11-04T13:31:50Z', [
          '2026-11-04T13:10:00Z',
          '2026-11-04T13:25:00Z',
          '2026-11-04T12:00:00Z',
        ]);

        await handleMessage(message);

        expect(lastUpdate()).toBe('4 Nov, 14:25');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:25:00Z'));
      });

      it('should_ignoreUnparseablePointTimestamps_when_pickingNewest', async () => {
        const message = mqttMessage('2026-11-04T13:31:50Z', [
          'not a date',
          '2026-11-04T13:10:00Z',
          '',
        ]);

        await handleMessage(message);

        expect(lastUpdate()).toBe('4 Nov, 14:10');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:10:00Z'));
      });

      it('should_fallBackToMessageTimestamp_when_messageHasNoPoints', async () => {
        await handleMessage(mqttMessage('2026-11-04T13:30:00Z', []));

        expect(lastUpdate()).toBe('4 Nov, 14:30');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
      });

      it('should_fallBackToMessageTimestamp_when_noPointTimestampIsValid', async () => {
        await handleMessage(mqttMessage('2026-11-04T13:30:00Z', ['garbage', '']));

        expect(lastUpdate()).toBe('4 Nov, 14:30');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
      });

      it('should_fallBackToNow_when_messageTimestampIsAlsoInvalid', async () => {
        await handleMessage(mqttMessage('garbage', ['also garbage']));

        expect(lastUpdate()).toBe('4 Nov, 14:32');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_fallBackToNow_when_messageHasNoDataAtAll', async () => {
        await handleMessage({ timestamp: undefined, data: undefined } as unknown as StreamMessage);

        expect(lastUpdate()).toBe('4 Nov, 14:32');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_clampToNow_when_pointTimestampIsInTheFuture', async () => {
        await handleMessage(mqttMessage('2026-11-04T13:31:00Z', ['2026-11-04T15:00:00Z']));

        expect(lastUpdate()).toBe('4 Nov, 14:32');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
        expect(vehicle['getLastDataUpdateMs']()).toBe(NOW.getTime());
      });

      it('should_clampToNow_when_messageTimestampIsInTheFuture', async () => {
        await handleMessage(mqttMessage('2026-11-04T18:00:00Z', []));

        expect(lastUpdate()).toBe('4 Nov, 14:32');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_clampToNowWhenRecording_when_callerPassesAFutureTime', async () => {
        await vehicle['recordCarDataUpdate'](NOW.getTime() + 3_600_000);

        expect(lastUpdate()).toBe('4 Nov, 14:32');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_useNowWhenRecording_when_callerPassesAnInvalidTime', async () => {
        await vehicle['recordCarDataUpdate'](Number.NaN);

        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_notMoveBackwards_when_olderDataArrives', async () => {
        await handleMessage(messageMeasuredAt('2026-11-04T13:30:00Z'));
        const labelWritesBefore = labelWrites().length;
        const storeWritesBefore = storeWrites().length;

        // Past the store throttle window, so only the age of the data can explain a skipped write
        jest.setSystemTime(new Date(NOW.getTime() + 120_000));
        await handleMessage(messageMeasuredAt('2026-11-04T13:10:00Z'));

        expect(lastUpdate()).toBe('4 Nov, 14:30');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
        expect(labelWrites()).toHaveLength(labelWritesBefore);
        expect(storeWrites()).toHaveLength(storeWritesBefore);
      });

      it('should_acceptNewData_when_homeyClockSteppedBackBehindTheRecordedTime', async () => {
        // Recorded while the Homey clock was right
        await handleMessage(messageMeasuredAt('2026-11-04T13:30:00Z'));

        // The Homey clock steps back an hour (e.g. corrected after running ahead, or reset at boot)
        jest.setSystemTime(new Date('2026-11-04T12:35:00Z'));
        await handleMessage(messageMeasuredAt('2026-11-04T12:34:00Z'));

        // The new reading wins instead of being ignored until the clock catches up
        expect(lastUpdate()).toBe('4 Nov, 13:34');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T12:34:00Z'));
        expect(vehicle['getLastDataUpdateMs']()).toBe(Date.parse('2026-11-04T12:34:00Z'));
      });

      it('should_acceptNewData_when_storedTimeFromBeforeRestartIsInTheFuture', async () => {
        store.set(STORE_KEY_LAST_DATA_UPDATE, NOW.getTime() + 3 * 60 * 60_000);

        await handleMessage(messageMeasuredAt('2026-11-04T13:30:00Z'));

        expect(lastUpdate()).toBe('4 Nov, 14:30');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
      });

      it('should_keepNewerDataTime_when_oldMessageIsReplayedAfterNewerOne', async () => {
        await handleMessage(messageMeasuredAt('2026-11-04T13:31:00Z'));
        const labelWritesBefore = labelWrites().length;
        const storeWritesBefore = storeWrites().length;

        // After a reconnect the broker replays a queued message: stamped now, measured hours ago
        jest.setSystemTime(new Date(NOW.getTime() + 120_000));
        await handleMessage(mqttMessage(new Date().toISOString(), ['2026-11-04T09:00:00Z']));

        expect(lastUpdate()).toBe('4 Nov, 14:31');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:31:00Z'));
        expect(labelWrites()).toHaveLength(labelWritesBefore);
        expect(storeWrites()).toHaveLength(storeWritesBefore);
        expect(vehicle['getLastDataUpdateMs']()).toBe(Date.parse('2026-11-04T13:31:00Z'));
      });

      it('should_stillApplyTheOldMessageToTheState_when_dataTimeDoesNotMove', async () => {
        await handleMessage(messageMeasuredAt('2026-11-04T13:31:00Z'));
        const replay = mqttMessage(new Date().toISOString(), ['2026-11-04T09:00:00Z']);

        await handleMessage(replay);

        expect(mockStateManager.updateFromMqttMessage).toHaveBeenCalledWith(replay);
      });

      it('should_notGoBelowStoredValue_when_oldDataArrivesRightAfterRestart', async () => {
        // Nothing in memory after an app restart: only the store remembers the last data time
        store.set(STORE_KEY_LAST_DATA_UPDATE, Date.parse('2026-11-04T13:30:00Z'));

        await handleMessage(messageMeasuredAt('2026-11-04T10:00:00Z'));

        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
        expect(storeWrites()).toHaveLength(0);
        expect(lastUpdate()).toBeUndefined();
        expect(vehicle['getLastDataUpdateMs']()).toBe(Date.parse('2026-11-04T13:30:00Z'));
      });

      it('should_moveForward_when_newerDataThanStoredValueArrivesAfterRestart', async () => {
        store.set(STORE_KEY_LAST_DATA_UPDATE, Date.parse('2026-11-04T13:00:00Z'));

        await handleMessage(messageMeasuredAt('2026-11-04T13:30:00Z'));

        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
        expect(lastUpdate()).toBe('4 Nov, 14:30');
      });

      it('should_moveForward_when_newerDataArrives', async () => {
        await handleMessage(messageMeasuredAt('2026-11-04T13:20:00Z'));
        expect(lastUpdate()).toBe('4 Nov, 14:20');

        jest.setSystemTime(new Date(NOW.getTime() + 120_000));
        await handleMessage(messageMeasuredAt('2026-11-04T13:33:00Z'));

        expect(lastUpdate()).toBe('4 Nov, 14:33');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:33:00Z'));
      });

      it('should_throttleStoreWritesByWriteTime_when_dataTimeAdvancesQuickly', async () => {
        await handleMessage(messageMeasuredAt('2026-11-04T13:00:00Z'));
        expect(storeWrites()).toHaveLength(1);

        // Data time is 20 minutes later, but only 5 seconds passed since the last store write
        jest.setSystemTime(new Date(NOW.getTime() + 5_000));
        await handleMessage(messageMeasuredAt('2026-11-04T13:20:00Z'));

        expect(storeWrites()).toHaveLength(1);
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:00:00Z'));
        expect(lastUpdate()).toBe('4 Nov, 14:20');

        jest.setSystemTime(new Date(NOW.getTime() + 60_000));
        await handleMessage(messageMeasuredAt('2026-11-04T13:25:00Z'));

        expect(storeWrites()).toHaveLength(2);
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:25:00Z'));
      });

      it('should_keepLatestDataTimeInMemory_when_storeWriteWasThrottled', async () => {
        await handleMessage(messageNow());
        jest.setSystemTime(new Date(NOW.getTime() + 50_000));
        await handleMessage(messageNow()); // not persisted yet

        expect(vehicle['getLastDataUpdateMs']()).toBe(NOW.getTime() + 50_000);
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });
    });

    describe('REST polls', () => {
      it('should_recordNewestPointTimestamp_when_apiPollSucceeds', async () => {
        pollReturns('2026-11-04T12:00:00Z', '2026-11-04T12:45:00Z', '2026-11-04T11:00:00Z');

        await vehicle['executePoll']();

        expect(lastUpdate()).toBe('4 Nov, 13:45');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T12:45:00Z'));
      });

      it('should_ignoreUnparseablePointTimestamps_when_apiPollSucceeds', async () => {
        pollReturns('junk', '2026-11-04T12:15:00Z', '');

        await vehicle['executePoll']();

        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T12:15:00Z'));
      });

      it('should_fallBackToNow_when_pollPointsHaveNoValidTimestamp', async () => {
        pollReturns('junk');

        await vehicle['executePoll']();

        expect(lastUpdate()).toBe('4 Nov, 14:32');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_clampToNow_when_pollTimestampIsInTheFuture', async () => {
        pollReturns('2026-11-04T16:00:00Z');

        await vehicle['executePoll']();

        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
      });

      it('should_notMoveBackwards_when_pollReturnsOlderValuesThanTheStream', async () => {
        await handleMessage(messageMeasuredAt('2026-11-04T13:30:00Z'));
        const labelWritesBefore = labelWrites().length;
        const storeWritesBefore = storeWrites().length;
        pollReturns('2026-11-04T09:00:00Z');

        jest.setSystemTime(new Date(NOW.getTime() + 120_000));
        await vehicle['executePoll']();

        expect(mockStateManager.updateFromApi).toHaveBeenCalled();
        expect(lastUpdate()).toBe('4 Nov, 14:30');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:30:00Z'));
        expect(labelWrites()).toHaveLength(labelWritesBefore);
        expect(storeWrites()).toHaveLength(storeWritesBefore);
      });

      it('should_moveForward_when_pollReturnsNewerValuesThanBefore', async () => {
        pollReturns('2026-11-04T12:00:00Z');
        await vehicle['executePoll']();

        jest.setSystemTime(new Date(NOW.getTime() + 120_000));
        pollReturns('2026-11-04T13:20:00Z');
        await vehicle['executePoll']();

        expect(lastUpdate()).toBe('4 Nov, 14:20');
        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(Date.parse('2026-11-04T13:20:00Z'));
      });
    });
  });

  describe('isCarDataFresh (car_data_fresh condition)', () => {
    it('should_returnTrue_when_updatedWithinWindow', () => {
      store.set(STORE_KEY_LAST_DATA_UPDATE, NOW.getTime() - 10 * 60_000);

      expect(vehicle.isCarDataFresh(30)).toBe(true);
    });

    it('should_returnFalse_when_updatedBeforeWindow', () => {
      store.set(STORE_KEY_LAST_DATA_UPDATE, NOW.getTime() - 31 * 60_000);

      expect(vehicle.isCarDataFresh(30)).toBe(false);
    });

    it('should_returnFalse_when_noTimestampYet', () => {
      expect(vehicle.isCarDataFresh(30)).toBe(false);
    });

    it('should_becomeStale_when_timePassesWithoutData', async () => {
      await handleMessage(messageMeasuredAt('2026-11-04T13:30:00Z'));
      expect(vehicle.isCarDataFresh(5)).toBe(true);

      jest.setSystemTime(new Date(NOW.getTime() + 6 * 60_000));

      expect(vehicle.isCarDataFresh(5)).toBe(false);
      expect(vehicle.isCarDataFresh(10)).toBe(true);
    });

    it('should_useLatestDataTime_when_storeWriteWasThrottled', async () => {
      await handleMessage(messageNow());
      jest.setSystemTime(new Date(NOW.getTime() + 50_000));
      await handleMessage(messageNow()); // not persisted yet

      // 1 min 30 s after the second message, 2 min 20 s after the persisted one
      jest.setSystemTime(new Date(NOW.getTime() + 140_000));

      expect(vehicle.isCarDataFresh(2)).toBe(true);
    });

    it('should_notBeFresh_when_replayedMessageIsHoursOld', async () => {
      // Delivered right now, but the car measured the value 3.5 hours ago
      await handleMessage(mqttMessage(NOW.toISOString(), ['2026-11-04T10:00:00Z']));

      expect(vehicle.isCarDataFresh(30)).toBe(false);
      expect(vehicle.isCarDataFresh(120)).toBe(false);
      expect(vehicle.isCarDataFresh(240)).toBe(true);
    });

    it('should_stayFresh_when_oldMessageIsReplayedAfterNewerOne', async () => {
      await handleMessage(messageNow());

      jest.setSystemTime(new Date(NOW.getTime() + 2 * 60_000));
      await handleMessage(mqttMessage(new Date().toISOString(), ['2026-11-04T09:00:00Z']));

      expect(vehicle.isCarDataFresh(5)).toBe(true);
      expect(vehicle.isCarDataFresh(1)).toBe(false);
    });

    it('should_notBeFresh_when_pollReturnsHoursOldValues', async () => {
      pollReturns('2026-11-04T10:00:00Z', '2026-11-04T10:30:00Z');

      await vehicle['executePoll']();

      expect(vehicle.isCarDataFresh(30)).toBe(false);
      expect(vehicle.isCarDataFresh(240)).toBe(true);
    });

    it('should_beFresh_when_pollReturnsRecentValues', async () => {
      pollReturns('2026-11-04T10:00:00Z', '2026-11-04T13:29:00Z');

      await vehicle['executePoll']();

      expect(vehicle.isCarDataFresh(5)).toBe(true);
    });
  });

  describe('stream watchdog', () => {
    const WATCHDOG_MS = 60_000;
    const WATCHDOG_WARNING = 'MQTT stream found stopped with no retry pending - restarting';

    const watchdogWarnings = () =>
      mockLogger.warn.mock.calls.filter(([message]: [string]) => message === WATCHDOG_WARNING);

    /** Run one watchdog tick by hand and let any restart it triggers finish. */
    const tick = async () => {
      vehicle['runStreamWatchdog']();
      await settle();
    };

    const startServices = () => vehicle.initializeVehicleDataAndServices();

    beforeEach(() => {
      jest.spyOn(vehicle as any, 'initializeCarDataClient').mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'startApiPolling').mockImplementation(() => {});
      jest.spyOn(vehicle as any, 'stopApiPolling').mockImplementation(() => {});
      connectImpl.mockImplementation(connectsAndReports);
    });

    afterEach(async () => {
      await vehicle.onUninit();
    });

    describe('scheduling', () => {
      it('should_startOneMinuteHomeyInterval_when_servicesStart', async () => {
        await startServices();

        expect(vehicle.homey.setInterval).toHaveBeenCalledTimes(1);
        expect(vehicle.homey.setInterval).toHaveBeenCalledWith(expect.any(Function), WATCHDOG_MS);
        expect(jest.getTimerCount()).toBe(1);
      });

      it('should_startAfterStreamingAndPolling_when_servicesStart', async () => {
        await startServices();

        const setIntervalOrder = (vehicle.homey.setInterval as jest.Mock).mock
          .invocationCallOrder[0];
        const pollingOrder = (vehicle['startApiPolling'] as unknown as jest.Mock).mock
          .invocationCallOrder[0];
        expect(clients[0].subscribe.mock.invocationCallOrder[0]).toBeLessThan(setIntervalOrder);
        expect(pollingOrder).toBeLessThan(setIntervalOrder);
      });

      it('should_notStart_when_apiClientIsNotInitialised', async () => {
        vehicle['_carDataClient'] = undefined;

        await startServices();

        expect(vehicle.homey.setInterval).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
      });

      it('should_stopTheOldWatchdog_when_servicesReinitialiseWithoutApiClient', async () => {
        await startServices();
        expect(jest.getTimerCount()).toBe(1);

        vehicle['_carDataClient'] = undefined;
        await startServices();

        expect(jest.getTimerCount()).toBe(0);
      });

      it('should_notCreateSecondWatchdog_when_servicesReinitialise', async () => {
        await startServices();
        await startServices();
        await startServices();

        expect(vehicle.homey.setInterval).toHaveBeenCalledTimes(3);
        expect(vehicle.homey.clearInterval).toHaveBeenCalledTimes(2);
        expect(jest.getTimerCount()).toBe(1);

        // Exactly one watchdog restarts a dead stream
        const clientsBefore = clients.length;
        clients[clients.length - 1].emitState('disconnected');
        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);
        expect(clients).toHaveLength(clientsBefore + 1);
      });

      it('should_clearTheInterval_when_deviceUninitialised', async () => {
        await startServices();
        const handle = (vehicle.homey.setInterval as jest.Mock).mock.results[0].value;

        await vehicle.onUninit();

        expect(vehicle.homey.clearInterval).toHaveBeenCalledWith(handle);
        expect(jest.getTimerCount()).toBe(0);
      });

      it('should_clearTheInterval_when_deviceDeleted', async () => {
        await startServices();

        vehicle.onDeleted();

        expect(jest.getTimerCount()).toBe(0);
        expect(vehicle.homey.clearInterval).toHaveBeenCalledTimes(1);
      });

      it('should_notRestartAnything_when_servicesWereStopped', async () => {
        await startServices();
        await vehicle.onUninit();
        const clientsBefore = clients.length;

        await jest.advanceTimersByTimeAsync(3_600_000);

        expect(clients).toHaveLength(clientsBefore);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_tickOncePerMinute_when_running', async () => {
        await startServices();
        const tickSpy = jest.spyOn(vehicle as any, 'runStreamWatchdog');

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS - 1);
        expect(tickSpy).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(1);
        expect(tickSpy).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(WATCHDOG_MS * 4);
        expect(tickSpy).toHaveBeenCalledTimes(5);
      });
    });

    describe('restarting a stopped stream', () => {
      beforeEach(async () => {
        await startServices();
        expect(clients).toHaveLength(1);
      });

      it('should_restartStream_when_noClientExists', async () => {
        vehicle['_mqttClient'] = undefined;

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);

        expect(clients).toHaveLength(2);
        expect(vehicle['_mqttClient']).toBe(clients[1]);
        expect(clients[1].subscribe).toHaveBeenCalledWith('TEST_VIN_123');
        expect(watchdogWarnings()).toHaveLength(1);
        expect(streamState()).toBe('connected');
      });

      it('should_restartStream_when_clientIsDisconnected', async () => {
        clients[0].emitState('disconnected');

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);

        expect(clients).toHaveLength(2);
        expect(clients[0].disconnect).toHaveBeenCalled();
        expect(vehicle['_mqttClient']).toBe(clients[1]);
        expect(watchdogWarnings()).toHaveLength(1);
      });

      it('should_restartStream_when_clientIsInErrorStateAndNoRetryIsPending', async () => {
        clients[0].emitState('error');
        expect(vehicle['_streamRetryTimer']).toBeUndefined();

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);

        expect(clients).toHaveLength(2);
        expect(watchdogWarnings()).toHaveLength(1);
      });

      it('should_waitForTheNextTick_when_streamStopsBetweenTicks', async () => {
        await jest.advanceTimersByTimeAsync(WATCHDOG_MS - 1_000);
        clients[0].emitState('disconnected');

        await jest.advanceTimersByTimeAsync(999);
        expect(clients).toHaveLength(1);

        await jest.advanceTimersByTimeAsync(1);
        expect(clients).toHaveLength(2);
      });

      it('should_restartOnlyOnce_when_theStreamIsBackUp', async () => {
        clients[0].emitState('disconnected');

        await jest.advanceTimersByTimeAsync(10 * WATCHDOG_MS);

        expect(clients).toHaveLength(2);
        expect(watchdogWarnings()).toHaveLength(1);
      });

      it('should_keepWatching_when_theRestartedStreamStopsAgain', async () => {
        clients[0].emitState('disconnected');
        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);
        expect(clients).toHaveLength(2);

        clients[1].emitState('disconnected');
        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);

        expect(clients).toHaveLength(3);
        expect(watchdogWarnings()).toHaveLength(2);
      });

      it('should_scheduleNormalRetry_when_watchdogRestartFails', async () => {
        clients[0].emitState('disconnected');
        connectImpl.mockImplementation(failingConnect);

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);

        expect(clients).toHaveLength(2);
        expect(vehicle['_streamRetryTimer']).toBeDefined();
        expect(streamState()).toBe('reconnecting');
      });

      it('should_useEffectiveStreamingSetting_when_settingsNotPersistedYet', async () => {
        // onSettings runs before Homey persists the value: the device's own copy wins
        setStreamingSettingInStore(false);
        vehicle['_streamingEnabled'] = true;
        clients[0].emitState('disconnected');

        await tick();

        expect(clients).toHaveLength(2);
      });
    });

    describe('leaving the stream alone', () => {
      beforeEach(async () => {
        await startServices();
      });

      it.each(['connected', 'connecting', 'reconnecting'] as ConnectionState[])(
        'should_doNothing_when_clientIs_%s',
        async (state) => {
          clients[0].emitState(state);

          await tick();

          expect(clients).toHaveLength(1);
          expect(watchdogWarnings()).toHaveLength(0);
        }
      );

      it('should_doNothing_when_streamStaysHealthyForAWhile', async () => {
        await jest.advanceTimersByTimeAsync(30 * WATCHDOG_MS);

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_aRetryIsPending', async () => {
        // A failed start leaves no client behind but a scheduled retry
        connectImpl.mockImplementation(failingConnect);
        await vehicle['initializeMqttStreaming']();
        const clientsBefore = clients.length;
        expect(vehicle['_streamRetryTimer']).toBeDefined();
        expect(vehicle['_mqttClient']).toBeUndefined();

        await tick();

        expect(clients).toHaveLength(clientsBefore);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_aRetryIsPendingAndClientIsInErrorState', async () => {
        clients[0].emitState('error');
        vehicle['_streamRetryTimer'] = vehicle.homey.setTimeout(() => {}, 30_000);

        await tick();

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_aStartAttemptIsInFlight', async () => {
        connectImpl.mockImplementation(() => new Promise<void>(() => {}));
        void vehicle['startMqttStream']();
        await settle();
        expect(clients).toHaveLength(2);
        // The client of the attempt looks stopped (it is 'disconnected' before it connects)
        expect(clients[1].getConnectionState()).toBe('disconnected');

        await tick();

        expect(clients).toHaveLength(2);
        expect(connectImpl).toHaveBeenCalledTimes(2);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_anAttemptIsInFlightAndNoClientExistsYet', async () => {
        // Window at the start of an attempt: the old client is disposed, the new one not created
        vehicle['_mqttClient'] = undefined;
        vehicle['_streamAttemptGeneration'] = vehicle['_streamGeneration'] ?? 0;

        await tick();

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_streamingIsDisabledInSettings', async () => {
        clients[0].emitState('disconnected');
        vehicle['_streamingEnabled'] = undefined;
        setStreamingSettingInStore(false);

        await tick();

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_userTurnedStreamingOff', async () => {
        await vehicle.onSettings({
          newSettings: { ...mockSettings, streamingEnabled: false },
          changedKeys: ['streamingEnabled'],
        });
        setStreamingSettingInStore(true); // stale persisted value; the device's own copy wins
        expect(vehicle['_mqttClient']).toBeUndefined();

        await jest.advanceTimersByTimeAsync(5 * WATCHDOG_MS);

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
        expect(streamState()).toBe('disabled');
      });

      it('should_doNothing_when_noAuthProvider', async () => {
        vehicle['_mqttClient'] = undefined;
        vehicle['_authProvider'] = undefined;

        await tick();

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
      });

      it('should_doNothing_when_noApiClient', async () => {
        vehicle['_mqttClient'] = undefined;
        vehicle['_carDataClient'] = undefined;

        await tick();

        expect(clients).toHaveLength(1);
        expect(watchdogWarnings()).toHaveLength(0);
      });
    });

    describe('error handling', () => {
      beforeEach(async () => {
        await startServices();
        clients[0].emitState('disconnected');
      });

      it('should_catchAndLog_when_restartThrowsSynchronously', async () => {
        const boom = new Error('boom');
        jest.spyOn(vehicle as any, 'startMqttStream').mockImplementation(() => {
          throw boom;
        });

        expect(() => vehicle['runStreamWatchdog']()).not.toThrow();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('stream watchdog'),
          boom
        );
      });

      it('should_catchAndLog_when_restartRejects', async () => {
        const boom = new Error('async boom');
        jest.spyOn(vehicle as any, 'startMqttStream').mockRejectedValue(boom);

        vehicle['runStreamWatchdog']();
        await settle();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('stream watchdog'),
          boom
        );
      });

      it('should_catchAndLog_when_settingsCannotBeRead', async () => {
        vehicle['_streamingEnabled'] = undefined;
        vehicle.getSettings = jest.fn(() => {
          throw new Error('settings unavailable');
        });

        expect(() => vehicle['runStreamWatchdog']()).not.toThrow();

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('stream watchdog'),
          expect.any(Error)
        );
      });

      it('should_keepTicking_when_aTickFailed', async () => {
        const startSpy = jest
          .spyOn(vehicle as any, 'startMqttStream')
          .mockRejectedValueOnce(new Error('first fails'));

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);
        expect(startSpy).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(WATCHDOG_MS);
        expect(startSpy).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('isCarDataStreamLive (car_data_stream_live condition)', () => {
    it('should_returnFalse_when_nothingHasStartedYet', () => {
      expect(vehicle.isCarDataStreamLive()).toBe(false);
    });

    it('should_returnTrue_when_streamIsConnected', async () => {
      await vehicle['initializeMqttStreaming']();
      clients[0].emitState('connected');
      await settle();

      expect(vehicle.isCarDataStreamLive()).toBe(true);
    });

    it.each(['connecting', 'reconnecting'] as ConnectionState[])(
      'should_returnFalse_when_clientIs_%s',
      async (state) => {
        await vehicle['initializeMqttStreaming']();
        clients[0].emitState('connected');
        clients[0].emitState(state);
        await settle();

        expect(vehicle.isCarDataStreamLive()).toBe(false);
      }
    );

    it('should_returnFalse_when_streamDropsAfterBeingLive', async () => {
      await vehicle['initializeMqttStreaming']();
      clients[0].emitState('connected');
      await settle();
      expect(vehicle.isCarDataStreamLive()).toBe(true);

      clients[0].emitState('reconnecting');
      await settle();

      expect(vehicle.isCarDataStreamLive()).toBe(false);
    });

    it('should_returnFalse_when_startFailedAndRetryIsPending', async () => {
      connectImpl.mockImplementation(failingConnect);

      await vehicle['initializeMqttStreaming']();

      expect(streamState()).toBe('reconnecting');
      expect(vehicle.isCarDataStreamLive()).toBe(false);
    });

    it('should_returnFalse_when_streamingIsDisabled', async () => {
      setStreamingSettingInStore(false);

      await vehicle['initializeMqttStreaming']();

      expect(streamState()).toBe('disabled');
      expect(vehicle.isCarDataStreamLive()).toBe(false);
    });

    it('should_returnFalse_when_streamingIsUnavailable', async () => {
      vehicle['_authProvider'] = undefined;

      await vehicle['initializeMqttStreaming']();

      expect(streamState()).toBe('unavailable');
      expect(vehicle.isCarDataStreamLive()).toBe(false);
    });

    it('should_returnFalse_when_onlyAStaleCapabilityValueFromBeforeRestartExists', () => {
      // Says nothing about the stream of this process
      capabilities.set(Capabilities.CARDATA_STREAM_STATE, 'connected');

      expect(vehicle.isCarDataStreamLive()).toBe(false);
    });
  });

  describe('Homey-managed retry timer', () => {
    it('should_scheduleRetryWithHomeySetTimeout_when_startFails', async () => {
      connectImpl.mockImplementation(failingConnect);

      await vehicle['initializeMqttStreaming']();

      expect(vehicle.homey.setTimeout).toHaveBeenCalledTimes(1);
      expect(vehicle.homey.setTimeout).toHaveBeenCalledWith(expect.any(Function), 30_000);
      expect(vehicle['_streamRetryTimer']).toBe(
        (vehicle.homey.setTimeout as jest.Mock).mock.results[0].value
      );
    });

    it('should_notUseGlobalTimers_when_schedulingRetry', async () => {
      const handle = { id: 'homey-timer' } as unknown as NodeJS.Timeout;
      (vehicle.homey.setTimeout as jest.Mock).mockReturnValue(handle);
      connectImpl.mockImplementation(failingConnect);

      await vehicle['initializeMqttStreaming']();

      expect(vehicle['_streamRetryTimer']).toBe(handle);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_startNextAttempt_when_homeyTimerCallbackRuns', async () => {
      let retry: (() => void) | undefined;
      (vehicle.homey.setTimeout as jest.Mock).mockImplementation((callback: () => void) => {
        retry = callback;
        return { id: 'homey-timer' };
      });
      connectImpl.mockImplementationOnce(failingConnect).mockResolvedValue(undefined);
      await vehicle['initializeMqttStreaming']();
      expect(clients).toHaveLength(1);

      retry?.();
      await settle();

      expect(clients).toHaveLength(2);
      expect(vehicle['_streamRetryTimer']).toBeUndefined();
    });

    it('should_clearWithHomeyClearTimeout_when_retryIsCancelled', async () => {
      connectImpl.mockImplementation(failingConnect);
      await vehicle['initializeMqttStreaming']();
      const handle = vehicle['_streamRetryTimer'];

      vehicle['cancelStreamRetry']();

      expect(vehicle.homey.clearTimeout).toHaveBeenCalledWith(handle);
      expect(vehicle['_streamRetryTimer']).toBeUndefined();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_clearWithHomeyClearTimeout_when_deviceIsUninitialised', async () => {
      connectImpl.mockImplementation(failingConnect);
      await vehicle['initializeMqttStreaming']();
      const handle = vehicle['_streamRetryTimer'];

      await vehicle.onUninit();

      expect(vehicle.homey.clearTimeout).toHaveBeenCalledWith(handle);
    });

    it('should_replaceTimerWithHomeyClearTimeout_when_retryIsRescheduled', async () => {
      await vehicle['scheduleStreamRetry']();
      const first = vehicle['_streamRetryTimer'];

      await vehicle['scheduleStreamRetry']();

      expect(vehicle.homey.clearTimeout).toHaveBeenCalledWith(first);
      expect(vehicle['_streamRetryTimer']).not.toBe(first);
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('capability migration', () => {
    let addCapabilitySafeSpy: jest.SpyInstance;

    beforeEach(() => {
      addCapabilitySafeSpy = jest
        .spyOn(vehicle as any, 'addCapabilitySafe')
        .mockResolvedValue(undefined);
      jest.spyOn(vehicle as any, 'removeCapabilitySafe').mockResolvedValue(undefined);
      vehicle.getClass = jest.fn().mockReturnValue('car');
      vehicle.getEnergy = jest.fn().mockReturnValue({ batteries: ['INTERNAL'], electricCar: true });
    });

    it('should_addBothCapabilities_when_electricDeviceMigrates', async () => {
      await vehicle.migrate_device_capabilities();

      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CARDATA_STREAM_STATE);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CARDATA_LAST_UPDATE);
    });

    it('should_addBothCapabilities_when_combustionDeviceMigrates', async () => {
      mockStateManager.getDriveTrain.mockReturnValue(DriveTrainType.COMBUSTION);

      await vehicle.migrate_device_capabilities();

      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CARDATA_STREAM_STATE);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CARDATA_LAST_UPDATE);
    });

    it('should_addBothCapabilities_when_driveTrainStillUnknown', async () => {
      mockStateManager.getDriveTrain.mockReturnValue(DriveTrainType.UNKNOWN);

      await vehicle.migrate_device_capabilities();

      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CARDATA_STREAM_STATE);
      expect(addCapabilitySafeSpy).toHaveBeenCalledWith(Capabilities.CARDATA_LAST_UPDATE);
    });

    it('should_neverRemoveNewCapabilities_when_migrating', async () => {
      const removeSpy = vehicle['removeCapabilitySafe'] as unknown as jest.Mock;

      await vehicle.migrate_device_capabilities();

      expect(removeSpy).not.toHaveBeenCalledWith(Capabilities.CARDATA_STREAM_STATE);
      expect(removeSpy).not.toHaveBeenCalledWith(Capabilities.CARDATA_LAST_UPDATE);
    });
  });
});
