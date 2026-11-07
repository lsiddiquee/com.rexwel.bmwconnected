/**
 * Recovery tests for MqttStreamClient
 *
 * Tests:
 * - onStateChange() event sequence (no duplicates, handler isolation)
 * - Failed connect() cleans up the half-created mqtt.js client
 * - Auth recovery with exponential backoff (30s, 60s, 120s, 240s, 480s, then 900s)
 * - Proactive credential renewal shortly before the token expires
 * - Owner disconnect() stops renewal, retries and in-flight recovery
 *
 * All timing uses jest fake timers; every mqtt.connect() call returns a fresh mock client so
 * that stale-client behaviour is observable.
 */

import { MqttStreamClient } from '../../../lib/streaming/MqttStreamClient';
import type { ConnectionState } from '../../../lib/streaming/IMqttClient';
import { IAuthProvider } from '../../../lib/auth/IAuthProvider';
import { ILogger } from '../../../lib/types/ILogger';
import { AuthToken } from '../../../lib/models/AuthToken';
import * as mqtt from 'mqtt';
import { EventEmitter } from 'events';

jest.mock('mqtt');

type MockMqttClient = EventEmitter & {
  connected: boolean;
  end: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
};

/** How a freshly created mock mqtt.js client behaves */
type ConnectBehaviour = 'accept' | 'hang' | 'refuse-auth';

const START_TIME = new Date('2026-01-15T12:00:00.000Z');
const AUTH_ERROR = 'Connection refused: Bad username or password';
const TOPIC = 'test-gcid/TEST_VIN_123';

/** Backoff schedule after a failed recovery (milliseconds) */
const BACKOFF_MS = [30000, 60000, 120000, 240000, 480000, 900000, 900000];

describe('MqttStreamClient recovery', () => {
  let client: MqttStreamClient;
  let mockAuthProvider: jest.Mocked<IAuthProvider>;
  let mockLogger: jest.Mocked<ILogger>;
  let created: MockMqttClient[];
  let behaviours: ConnectBehaviour[];
  let failNextSubscribes: number;
  let tokenCounter: number;

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  /** Build a token that expires `expiresInSeconds` from the (fake) current time */
  const makeToken = (expiresInSeconds: number): AuthToken => {
    tokenCounter += 1;
    return {
      gcid: 'test-gcid',
      idToken: `id-token-${tokenCounter}`,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresAt: nowSeconds() + expiresInSeconds,
    };
  };

  const createMockMqttClient = (): MockMqttClient => {
    const mock: MockMqttClient = Object.assign(new EventEmitter(), {
      connected: false,
      end: jest.fn((_force: boolean, _opts: unknown, callback?: () => void) => {
        mock.connected = false;
        if (callback) callback();
      }),
      subscribe: jest.fn((_topic: string, _opts: unknown, callback?: (e: Error | null) => void) => {
        if (failNextSubscribes > 0) {
          failNextSubscribes -= 1;
          if (callback) callback(new Error('SUBACK failure'));
        } else if (callback) {
          callback(null);
        }
      }),
      unsubscribe: jest.fn(
        (_topic: string, _opts: unknown, callback?: (e: Error | null) => void) => {
          if (callback) callback(null);
        }
      ),
    });
    return mock;
  };

  /** Let pending promise continuations run without advancing the fake clock */
  const flush = async () => {
    await jest.advanceTimersByTimeAsync(0);
  };

  const advance = async (ms: number) => {
    await jest.advanceTimersByTimeAsync(ms);
  };

  const emitAuthError = (mock: MockMqttClient) => {
    mock.emit('error', new Error(AUTH_ERROR));
  };

  const lastClient = (): MockMqttClient => created[created.length - 1];

  const connectCalls = () => (mqtt.connect as jest.Mock).mock.calls.length;

  const collectStates = (): ConnectionState[] => {
    const states: ConnectionState[] = [];
    client.onStateChange((state) => states.push(state));
    return states;
  };

  /** Connect the client and subscribe to the test VIN */
  const connectAndSubscribe = async () => {
    await client.connect();
    await client.subscribe('TEST_VIN_123');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(START_TIME);

    created = [];
    behaviours = [];
    failNextSubscribes = 0;
    tokenCounter = 0;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as any;

    mockAuthProvider = {
      getToken: jest.fn().mockImplementation(async () => makeToken(3600)),
      refreshTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
    } as any;

    (mqtt.connect as jest.Mock).mockImplementation(() => {
      const mock = createMockMqttClient();
      created.push(mock);
      const behaviour = behaviours.shift() ?? 'accept';

      if (behaviour === 'accept') {
        void Promise.resolve().then(() => {
          mock.connected = true;
          mock.emit('connect');
        });
      } else if (behaviour === 'refuse-auth') {
        void Promise.resolve().then(() => {
          mock.emit('error', new Error(AUTH_ERROR));
        });
      }
      // 'hang': never answers, the caller times out
      return mock;
    });

    client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'TEST_VIN_123');
  });

  afterEach(async () => {
    await client.disconnect();
    jest.useRealTimers();
  });

  describe('onStateChange()', () => {
    it('should_emitConnectingThenConnected_when_connectSucceeds', async () => {
      const states = collectStates();

      await client.connect();

      expect(states).toEqual(['connecting', 'connected']);
    });

    it('should_emitReconnectingOnce_when_closeOfflineAndReconnectFollowEachOther', async () => {
      await client.connect();
      const states = collectStates();

      created[0].emit('close');
      created[0].emit('offline');
      created[0].emit('reconnect');
      created[0].emit('reconnect');

      expect(states).toEqual(['reconnecting']);
    });

    it('should_emitConnected_when_mqttJsAutoReconnectSucceeds', async () => {
      await client.connect();
      const states = collectStates();

      created[0].emit('close');
      created[0].connected = true;
      created[0].emit('connect');

      expect(states).toEqual(['reconnecting', 'connected']);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_emitConnectingThenError_when_connectFails', async () => {
      behaviours.push('hang');
      const states = collectStates();

      const settled = client.connect().catch((e: Error) => e);
      await advance(30000);
      const error = await settled;

      expect(error).toBeInstanceOf(Error);
      expect(states).toEqual(['connecting', 'error']);
    });

    it('should_keepConnectingState_when_mqttJsReportsOfflineDuringConnect', async () => {
      behaviours.push('hang');
      const states = collectStates();

      const settled = client.connect().catch((e: Error) => e);
      await flush();
      created[0].emit('offline');
      created[0].emit('close');
      created[0].emit('reconnect');

      expect(client.getConnectionState()).toBe('connecting');

      created[0].connected = true;
      created[0].emit('connect');
      await settled;

      expect(states).toEqual(['connecting', 'connected']);
    });

    it('should_emitDisconnected_when_ownerDisconnects', async () => {
      await client.connect();
      const states = collectStates();

      await client.disconnect();
      // mqtt.js emits close while ending; this must not look like a reconnect
      created[0].emit('close');

      expect(states).toEqual(['disconnected']);
      expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should_notEmitAnything_when_ownerDisconnectsAnAlreadyDisconnectedClient', async () => {
      const states = collectStates();

      await client.disconnect();

      expect(states).toEqual([]);
    });

    it('should_emitReconnectingThenConnected_when_authRecoverySucceeds', async () => {
      await client.connect();
      const states = collectStates();

      emitAuthError(created[0]);
      await flush();

      expect(states).toEqual(['reconnecting', 'connected']);
    });

    it('should_emitReconnectingOnlyOnce_while_waitingForBackoffRetry', async () => {
      await client.connect();
      const states = collectStates();
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('token endpoint down'));
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('token endpoint down'));

      emitAuthError(created[0]);
      await flush();
      await advance(30000);
      await advance(60000);

      expect(states).toEqual(['reconnecting', 'connected']);
    });

    it('should_notBreakClientOrOtherHandlers_when_stateHandlerThrows', async () => {
      const throwing = jest.fn().mockImplementation(() => {
        throw new Error('handler boom');
      });
      const healthy = jest.fn();
      client.onStateChange(throwing);
      client.onStateChange(healthy);

      await expect(client.connect()).resolves.toBeUndefined();

      expect(throwing).toHaveBeenCalledWith('connecting');
      expect(healthy).toHaveBeenCalledWith('connecting');
      expect(healthy).toHaveBeenCalledWith('connected');
      expect(mockLogger.error).toHaveBeenCalledWith('Error in event handler', expect.any(Error), {
        event: 'stateChange',
      });
    });

    it('should_notChangeStateToError_when_nonAuthErrorOccursOnLiveConnection', async () => {
      await client.connect();
      const states = collectStates();
      const errorHandler = jest.fn();
      client.onError(errorHandler);

      created[0].emit('error', new Error('read ECONNRESET'));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(states).toEqual([]);
      expect(client.getConnectionState()).toBe('connected');
    });
  });

  describe('failed connect() cleanup', () => {
    it('should_endClientWithForceAndClearIt_when_connectTimesOut', async () => {
      behaviours.push('hang');

      const settled = client.connect().catch((e: Error) => e);
      await advance(30000);
      const error = await settled;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('MQTT connection timeout');
      expect(created[0].end).toHaveBeenCalledTimes(1);
      expect(created[0].end.mock.calls[0][0]).toBe(true);
      expect(client.isConnected()).toBe(false);
      expect(client.getConnectionState()).toBe('error');
    });

    it('should_endClientWithForce_when_brokerRefusesTheConnection', async () => {
      behaviours.push('refuse-auth');

      await expect(client.connect()).rejects.toThrow('MQTT connection failed');

      expect(created[0].end).toHaveBeenCalledTimes(1);
      expect(created[0].end.mock.calls[0][0]).toBe(true);
    });

    it('should_ignoreFurtherEventsFromDiscardedClient', async () => {
      behaviours.push('refuse-auth');
      const errorHandler = jest.fn();
      client.onError(errorHandler);
      await expect(client.connect()).rejects.toThrow();
      errorHandler.mockClear();

      // mqtt.js would have kept emitting if it were still alive
      created[0].emit('close');
      created[0].emit('reconnect');
      created[0].connected = true;
      created[0].emit('connect');
      emitAuthError(created[0]);
      await flush();

      expect(client.getConnectionState()).toBe('error');
      expect(errorHandler).not.toHaveBeenCalled();
      expect(connectCalls()).toBe(1);
    });

    it('should_notStartAnyRecoveryOrRetry_when_initialConnectIsRefused', async () => {
      behaviours.push('refuse-auth');
      await expect(client.connect()).rejects.toThrow();

      await advance(60 * 60 * 1000);

      expect(connectCalls()).toBe(1);
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(1);
      expect(client.getConnectionState()).toBe('error');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_allowFreshConnect_after_failedConnect', async () => {
      behaviours.push('hang');
      const settled = client.connect().catch((e: Error) => e);
      await advance(30000);
      await settled;

      await expect(client.connect()).resolves.toBeUndefined();

      expect(connectCalls()).toBe(2);
      expect(client.isConnected()).toBe(true);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_notScheduleRenewal_when_connectFails', async () => {
      behaviours.push('hang');
      const settled = client.connect().catch((e: Error) => e);
      await advance(30000);
      await settled;

      await advance(2 * 60 * 60 * 1000);

      expect(connectCalls()).toBe(1);
    });
  });

  describe('auth recovery', () => {
    it('should_reconnectWithFreshCredentialsAndResubscribe_when_authErrorOccurs', async () => {
      await connectAndSubscribe();

      emitAuthError(created[0]);
      await flush();

      expect(connectCalls()).toBe(2);
      expect(created[0].end.mock.calls[0][0]).toBe(true);
      const options = (mqtt.connect as jest.Mock).mock.calls[1][1];
      expect(options.password).toBe('id-token-2');
      expect(created[1].subscribe).toHaveBeenCalledWith(TOPIC, { qos: 1 }, expect.any(Function));
      expect(client.getActiveSubscriptions()).toEqual([TOPIC]);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_resubscribeEveryTopicWithItsQos_when_recovering', async () => {
      await client.connect();
      await client.subscribe('VIN_A', 0);
      await client.subscribe('VIN_B', 2);

      emitAuthError(created[0]);
      await flush();

      expect(created[1].subscribe).toHaveBeenCalledTimes(2);
      expect(created[1].subscribe).toHaveBeenCalledWith(
        'test-gcid/VIN_A',
        { qos: 0 },
        expect.any(Function)
      );
      expect(created[1].subscribe).toHaveBeenCalledWith(
        'test-gcid/VIN_B',
        { qos: 2 },
        expect.any(Function)
      );
    });

    it('should_retryAfter30Seconds_when_tokenRefreshFails', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('token endpoint down'));

      emitAuthError(created[0]);
      await flush();

      expect(connectCalls()).toBe(1);
      expect(client.getConnectionState()).toBe('reconnecting');
      expect(client.isConnected()).toBe(false);

      await advance(29999);
      expect(connectCalls()).toBe(1);

      await advance(1);
      expect(connectCalls()).toBe(2);
      expect(created[1].subscribe).toHaveBeenCalledWith(TOPIC, { qos: 1 }, expect.any(Function));
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_reportFailedRecoveryToErrorHandlers_but_keepRetrying', async () => {
      await connectAndSubscribe();
      const errorHandler = jest.fn();
      client.onError(errorHandler);
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('token endpoint down'));

      emitAuthError(created[0]);
      await flush();

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'token endpoint down' })
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'MQTT recovery failed',
        expect.any(Error),
        expect.objectContaining({ retryInMs: 30000 })
      );
    });

    it('should_followBackoffSchedule_30_60_120_240_480_then900Seconds', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValue(new Error('token endpoint down'));
      const baseline = mockAuthProvider.getToken.mock.calls.length;

      emitAuthError(created[0]);
      await flush();
      let attempts = 1;
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(baseline + attempts);

      for (const delay of BACKOFF_MS) {
        await advance(delay - 1);
        expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(baseline + attempts);

        await advance(1);
        attempts += 1;
        expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(baseline + attempts);
      }

      expect(client.getConnectionState()).toBe('reconnecting');
    });

    it('should_resetBackoff_after_successfulRecovery', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('down'));
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('down'));

      emitAuthError(created[0]);
      await flush();
      await advance(30000); // second attempt fails, next delay would be 60 s
      await advance(60000); // third attempt succeeds
      expect(connectCalls()).toBe(2);
      expect(client.getConnectionState()).toBe('connected');

      // A new failure must start from the beginning of the schedule again
      mockAuthProvider.getToken.mockRejectedValue(new Error('down again'));
      emitAuthError(lastClient());
      await flush();
      const callsAfterFailure = mockAuthProvider.getToken.mock.calls.length;

      await advance(29999);
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(callsAfterFailure);
      await advance(1);
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(callsAfterFailure + 1);
    });

    it('should_retryAndEndTheFailedClient_when_recoveryConnectTimesOut', async () => {
      await connectAndSubscribe();
      behaviours.push('hang');

      emitAuthError(created[0]);
      await flush();
      expect(connectCalls()).toBe(2);

      await advance(30000); // connect timeout of the recovery attempt
      expect(created[1].end.mock.calls[0][0]).toBe(true);
      expect(client.getConnectionState()).toBe('reconnecting');

      await advance(29999);
      expect(connectCalls()).toBe(2);
      await advance(1);
      expect(connectCalls()).toBe(3);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_retryAndEndTheClient_when_resubscribeFails', async () => {
      await connectAndSubscribe();

      failNextSubscribes = 1;
      emitAuthError(created[0]);
      await flush();

      expect(created[1].end.mock.calls[0][0]).toBe(true);
      expect(client.isConnected()).toBe(false);
      expect(client.getConnectionState()).toBe('reconnecting');

      await advance(30000);
      expect(connectCalls()).toBe(3);
      expect(created[2].subscribe).toHaveBeenCalledWith(TOPIC, { qos: 1 }, expect.any(Function));
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_runOnlyOneRecovery_when_authErrorsArriveWhileRecovering', async () => {
      await connectAndSubscribe();
      let release: (token: AuthToken) => void = () => undefined;
      mockAuthProvider.getToken.mockImplementationOnce(
        () =>
          new Promise<AuthToken>((resolve) => {
            release = resolve;
          })
      );

      emitAuthError(created[0]);
      emitAuthError(created[0]);
      await flush();
      emitAuthError(created[0]);
      await flush();

      // Still waiting for the token: exactly one recovery is in flight
      expect(connectCalls()).toBe(1);
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(2);

      release(makeToken(3600));
      await flush();

      expect(connectCalls()).toBe(2);
      expect(created[1].subscribe).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_runOnlyOneRecovery_when_recoveryIsTriggeredConcurrently', async () => {
      await connectAndSubscribe();
      let release: (token: AuthToken) => void = () => undefined;
      mockAuthProvider.getToken.mockImplementationOnce(
        () =>
          new Promise<AuthToken>((resolve) => {
            release = resolve;
          })
      );

      // Renewal and retry timers can race a running recovery; recover() itself must hold the line
      void (client as any).recover('renewal');
      void (client as any).recover('retry');
      void (client as any).recover('auth-error');
      await flush();
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(2); // initial connect + one recovery

      release(makeToken(3600));
      await flush();

      expect(connectCalls()).toBe(2);
      expect(created[1].subscribe).toHaveBeenCalledTimes(1);
    });

    it('should_ignoreAuthErrorsFromReplacedClient', async () => {
      await connectAndSubscribe();
      emitAuthError(created[0]);
      await flush();
      expect(connectCalls()).toBe(2);

      emitAuthError(created[0]); // old, torn down client
      await flush();

      expect(connectCalls()).toBe(2);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_recoverAgain_when_newClientHitsAuthErrorLater', async () => {
      await connectAndSubscribe();
      emitAuthError(created[0]);
      await flush();

      emitAuthError(created[1]);
      await flush();

      expect(connectCalls()).toBe(3);
      expect(created[2].subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('proactive credential renewal', () => {
    it('should_renewAtExpiresAtMinus45Seconds_and_resubscribe', async () => {
      await connectAndSubscribe();

      await advance((3600 - 45) * 1000 - 1);
      expect(connectCalls()).toBe(1);

      await advance(1);

      expect(connectCalls()).toBe(2);
      expect(created[0].end.mock.calls[0][0]).toBe(true);
      const options = (mqtt.connect as jest.Mock).mock.calls[1][1];
      expect(options.password).toBe('id-token-2');
      expect(created[1].subscribe).toHaveBeenCalledWith(TOPIC, { qos: 1 }, expect.any(Function));
      expect(client.getConnectionState()).toBe('connected');
      expect(client.isConnected()).toBe(true);
    });

    it('should_emitReconnectingThenConnected_when_renewing', async () => {
      await connectAndSubscribe();
      const states = collectStates();

      await advance((3600 - 45) * 1000);

      expect(states).toEqual(['reconnecting', 'connected']);
    });

    it('should_notReportOwnTeardownAsDisconnect_when_renewing', async () => {
      await connectAndSubscribe();
      const disconnectHandler = jest.fn();
      client.onDisconnect(disconnectHandler);
      // Like mqtt.js, emit close while ending, before the end callback runs
      created[0].end.mockImplementation((_force: boolean, _opts: unknown, cb?: () => void) => {
        created[0].connected = false;
        created[0].emit('offline');
        created[0].emit('close');
        if (cb) cb();
      });

      await advance((3600 - 45) * 1000);

      expect(connectCalls()).toBe(2);
      expect(disconnectHandler).not.toHaveBeenCalled();
    });

    it.each([
      ['expires in 10 seconds', 10],
      ['is already expired', -100],
      ['expires in 74 seconds', 74],
    ])('should_renewNoSoonerThan30Seconds_when_token_%s', async (_label, expiresIn) => {
      mockAuthProvider.getToken.mockImplementationOnce(async () => makeToken(expiresIn));
      await connectAndSubscribe();

      await advance(29999);
      expect(connectCalls()).toBe(1);

      await advance(1);
      expect(connectCalls()).toBe(2);
    });

    it('should_renewExactlyAtLeadTime_when_tokenLeavesRoomForIt', async () => {
      // 100 s validity: 100 - 45 = 55 s, above the 30 s floor
      mockAuthProvider.getToken.mockImplementationOnce(async () => makeToken(100));
      await connectAndSubscribe();

      await advance(54999);
      expect(connectCalls()).toBe(1);

      await advance(1);
      expect(connectCalls()).toBe(2);
    });

    it('should_scheduleNextRenewal_based_on_renewedToken', async () => {
      await connectAndSubscribe();

      await advance((3600 - 45) * 1000);
      expect(connectCalls()).toBe(2);

      await advance((3600 - 45) * 1000 - 1);
      expect(connectCalls()).toBe(2);
      await advance(1);
      expect(connectCalls()).toBe(3);
      expect(created[2].subscribe).toHaveBeenCalledTimes(1);
    });

    it('should_retryWithBackoff_when_renewalFails', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('token endpoint down'));

      await advance((3600 - 45) * 1000);
      expect(connectCalls()).toBe(1);
      expect(client.getConnectionState()).toBe('reconnecting');
      expect(client.isConnected()).toBe(false);

      await advance(29999);
      expect(connectCalls()).toBe(1);
      await advance(1);

      expect(connectCalls()).toBe(2);
      expect(created[1].subscribe).toHaveBeenCalledTimes(1);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should_replaceOldRenewalTimer_when_authRecoveryRenewsCredentials', async () => {
      await connectAndSubscribe();
      await advance(1000 * 1000); // t = 1000 s
      emitAuthError(created[0]);
      await flush();
      expect(connectCalls()).toBe(2);

      // Old renewal (t = 3555 s) must be gone; new one fires at t = 1000 + 3555 s
      await advance((3555 - 1000) * 1000);
      expect(connectCalls()).toBe(2);

      await advance(1000 * 1000 - 1);
      expect(connectCalls()).toBe(2);
      await advance(1);
      expect(connectCalls()).toBe(3);
    });

    it('should_skipRenewalAndWarn_when_expiryIsNotAFiniteNumber', async () => {
      mockAuthProvider.getToken.mockImplementationOnce(async () => ({
        ...makeToken(3600),
        expiresAt: Number.NaN,
      }));

      await client.connect();
      await advance(3 * 60 * 60 * 1000);

      expect(connectCalls()).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MQTT token expiry unknown, skipping proactive renewal',
        expect.any(Object)
      );
    });

    it('should_notOverflowTimer_when_expiryIsFarInTheFuture', async () => {
      // e.g. an expiry accidentally supplied in milliseconds
      mockAuthProvider.getToken.mockImplementationOnce(async () => ({
        ...makeToken(3600),
        expiresAt: Date.now() + 3600 * 1000,
      }));

      await client.connect();
      await advance(60 * 1000);

      // Node would clamp an overflowing delay to 1 ms and renew in a tight loop
      expect(connectCalls()).toBe(1);
    });

    it('should_ignoreStaleClientErrorsAndArmSingleRenewal_when_renewalIsInFlight', async () => {
      await connectAndSubscribe();
      let release: (token: AuthToken) => void = () => undefined;
      mockAuthProvider.getToken.mockImplementationOnce(
        () =>
          new Promise<AuthToken>((resolve) => {
            release = resolve;
          })
      );

      await advance((3600 - 45) * 1000); // renewal fires, token fetch hangs
      emitAuthError(created[0]); // stale client, ignored
      await flush();
      release(makeToken(3600));
      await flush();

      expect(connectCalls()).toBe(2);
      expect(jest.getTimerCount()).toBe(1); // only the next renewal timer
    });
  });

  describe('owner disconnect()', () => {
    it('should_cancelPendingRenewal_when_ownerDisconnects', async () => {
      await connectAndSubscribe();

      await client.disconnect();
      expect(jest.getTimerCount()).toBe(0); // renewal timer is gone, not merely harmless

      await advance(2 * 60 * 60 * 1000);
      expect(connectCalls()).toBe(1);
    });

    it('should_cancelPendingRetry_when_ownerDisconnectsWhileWaitingForBackoff', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValue(new Error('token endpoint down'));
      emitAuthError(created[0]);
      await flush();
      expect(client.getConnectionState()).toBe('reconnecting');
      const callsBefore = mockAuthProvider.getToken.mock.calls.length;

      await client.disconnect();
      expect(jest.getTimerCount()).toBe(0); // retry timer is gone, not merely harmless

      await advance(60 * 60 * 1000);

      expect(client.getConnectionState()).toBe('disconnected');
      expect(connectCalls()).toBe(1);
      expect(mockAuthProvider.getToken).toHaveBeenCalledTimes(callsBefore);
    });

    it('should_emitDisconnectedOnce_when_ownerDisconnectsWhileWaitingForBackoff', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValue(new Error('token endpoint down'));
      emitAuthError(created[0]);
      await flush();
      const states = collectStates();

      await client.disconnect();
      await client.disconnect();

      expect(states).toEqual(['disconnected']);
    });

    it('should_notReconnect_when_ownerDisconnectsWhileTokenIsBeingFetched', async () => {
      await connectAndSubscribe();
      let release: (token: AuthToken) => void = () => undefined;
      mockAuthProvider.getToken.mockImplementationOnce(
        () =>
          new Promise<AuthToken>((resolve) => {
            release = resolve;
          })
      );
      emitAuthError(created[0]);
      await flush();

      await client.disconnect();
      release(makeToken(3600));
      await advance(2 * 60 * 60 * 1000);

      expect(connectCalls()).toBe(1);
      expect(client.getConnectionState()).toBe('disconnected');
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_abortRecoveryWithoutRetry_when_ownerDisconnectsWhileRecoveryConnects', async () => {
      await connectAndSubscribe();
      behaviours.push('hang');
      emitAuthError(created[0]);
      await flush();
      expect(connectCalls()).toBe(2);

      await client.disconnect();
      await flush();

      expect(created[1].end).toHaveBeenCalled();
      expect(client.getConnectionState()).toBe('disconnected');
      expect(jest.getTimerCount()).toBe(0);

      await advance(2 * 60 * 60 * 1000);
      expect(connectCalls()).toBe(2);
    });

    it('should_notRecover_when_authErrorArrivesAfterOwnerDisconnect', async () => {
      await connectAndSubscribe();
      await client.disconnect();

      emitAuthError(created[0]);
      await flush();

      expect(connectCalls()).toBe(1);
      expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should_abortPendingConnect_when_ownerDisconnectsDuringConnect', async () => {
      behaviours.push('hang');
      const states = collectStates();
      const settled = client.connect().catch((e: Error) => e);
      await flush();

      await client.disconnect();
      const error = await settled;

      expect(error).toBeInstanceOf(Error);
      expect(client.getConnectionState()).toBe('disconnected');
      expect(states).toEqual(['connecting', 'disconnected']);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should_notCreateClient_when_ownerDisconnectsWhileCredentialsAreLoading', async () => {
      let release: (token: AuthToken) => void = () => undefined;
      mockAuthProvider.getToken.mockImplementationOnce(
        () =>
          new Promise<AuthToken>((resolve) => {
            release = resolve;
          })
      );
      const settled = client.connect().catch((e: Error) => e);
      await flush();

      await client.disconnect();
      release(makeToken(3600));
      const error = await settled;

      expect(error).toBeInstanceOf(Error);
      expect(connectCalls()).toBe(0);
      expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should_leaveNewClientAlone_when_staleRecoveryFailsAfterOwnerReconnected', async () => {
      await connectAndSubscribe();
      let release: (token: AuthToken) => void = () => undefined;
      mockAuthProvider.getToken.mockImplementationOnce(
        () =>
          new Promise<AuthToken>((resolve) => {
            release = resolve;
          })
      );
      emitAuthError(created[0]);
      await flush(); // recovery is now waiting for its token

      await client.disconnect();
      await client.connect(); // owner starts over on the same instance
      await client.subscribe('TEST_VIN_123');
      expect(connectCalls()).toBe(2);

      release(makeToken(3600)); // the abandoned recovery wakes up
      await advance(2 * 60 * 1000);

      expect(connectCalls()).toBe(2);
      expect(created[1].end).not.toHaveBeenCalled();
      expect(client.isConnected()).toBe(true);
      expect(client.getConnectionState()).toBe('connected');
      expect(jest.getTimerCount()).toBe(1); // just the new connection's renewal timer
    });

    it('should_workNormallyAgain_when_connectIsCalledAfterOwnerDisconnect', async () => {
      await connectAndSubscribe();
      await client.disconnect();

      await client.connect();
      await client.subscribe('TEST_VIN_123');
      expect(connectCalls()).toBe(2);

      // Recovery and renewal are armed again
      emitAuthError(created[1]);
      await flush();
      expect(connectCalls()).toBe(3);

      await advance((3600 - 45) * 1000);
      expect(connectCalls()).toBe(4);
    });

    it('should_supersedePendingRetry_when_ownerCallsConnectDuringBackoff', async () => {
      await connectAndSubscribe();
      mockAuthProvider.getToken.mockRejectedValueOnce(new Error('token endpoint down'));
      emitAuthError(created[0]);
      await flush();
      expect(client.getConnectionState()).toBe('reconnecting');

      await client.connect();
      expect(connectCalls()).toBe(2);

      await advance(60 * 1000); // pending retry must not create a third client
      expect(connectCalls()).toBe(2);
      expect(client.getConnectionState()).toBe('connected');
    });
  });
});
