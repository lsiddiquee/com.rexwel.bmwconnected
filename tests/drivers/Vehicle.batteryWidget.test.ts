/**
 * Vehicle battery widget tests
 *
 * Covers the data side of the "Car battery" dashboard widget on the device: the state it reads
 * (getBatteryWidgetState) and the realtime event that pushes a changed state to the widget, with
 * its throttle: a changed state goes out right away, a newer car data time only once a minute.
 */

jest.mock('geolocation-utils');

import { Vehicle } from '../../drivers/Vehicle';
import type { StreamMessage } from '../../lib/streaming/StreamMessage';
import type { ElectricVehicleState, VehicleStatus } from '../../lib/models/VehicleStatus';
import { BATTERY_WIDGET_EVENT, BatteryWidgetState } from '../../utils/BatteryWidgetState';
import { STORE_KEY_LAST_DATA_UPDATE } from '../../utils/StoreKeys';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

const NOW = new Date('2026-11-04T13:32:00Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** A status with only the fields the widget (and the flow states) read */
const statusOf = (
  overrides: Partial<Omit<VehicleStatus, 'electric'>> & {
    electric?: Partial<ElectricVehicleState>;
  } = {}
): VehicleStatus => {
  const { electric, ...rest } = overrides;
  return {
    vin: 'TEST_VIN_123',
    chargingCable: 'CONNECTED',
    carLock: 'UNKNOWN',
    chargingFlap: 'UNKNOWN',
    climateActivity: 'UNKNOWN',
    range: 300,
    ...rest,
    electric: {
      chargeLevelPercent: 60,
      range: 290,
      isChargerConnected: true,
      chargingStatus: 'NOT_CHARGING',
      ...electric,
    },
  } as VehicleStatus;
};

describe('Vehicle battery widget', () => {
  let vehicle: Vehicle;
  let mockLogger: any;
  let mockSettings: any;
  let realtime: jest.Mock;
  let store: Map<string, unknown>;
  let name: string;

  /** The states pushed to the widget so far */
  const emitted = (): BatteryWidgetState[] => realtime.mock.calls.map(([, state]) => state);

  /** The car measured data right now (fake time) */
  const recordNow = () => vehicle['recordCarDataUpdate'](Date.now());

  /** Move the fake clock on */
  const advance = (ms: number) => jest.setSystemTime(Date.now() + ms);

  /** Hand a status to the device the way the state manager does */
  const receive = (status: VehicleStatus) => vehicle['updateCapabilitiesFromStatus'](status);

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });

    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockLogger = result.mocks.mockLogger;
    mockSettings = result.mocks.mockSettings;

    realtime = jest.fn().mockResolvedValue(undefined);
    store = new Map();
    name = 'My i4';

    vehicle.homey = {
      app: result.mocks.mockApp,
      version: '12.5.0',
      clock: { getTimezone: jest.fn().mockReturnValue('Europe/Amsterdam') },
      api: { realtime },
      flow: {
        getDeviceTriggerCard: jest.fn().mockReturnValue({
          trigger: jest.fn().mockResolvedValue(undefined),
        }),
      },
    } as any;
    vehicle.getName = jest.fn(() => name);
    vehicle.getStoreValue = jest.fn((key: string) => store.get(key));
    vehicle.setStoreValue = jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    });
    vehicle['stateManager'] = {
      updateFromMqttMessage: jest.fn(),
      updateFromApi: jest.fn().mockResolvedValue(undefined),
      getVehicleStatus: jest.fn(),
    } as any;

    // The capability writes and flow triggers of a status are not under test: only that the status
    // becomes the current one before the widget is told
    vehicle['applyStatusToCapabilities'] = jest.fn((status: VehicleStatus) => {
      vehicle.currentVehicleState = status;
      return Promise.resolve();
    });
    vehicle['checkAndDebounceTripCompletion'] = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getBatteryWidgetState', () => {
    it('should_readTheCurrentStatusAndTheCarDataTime', () => {
      vehicle.currentVehicleState = statusOf({
        chargingCable: 'CONNECTED',
        electric: {
          chargeLevelPercent: 61.4,
          chargingStatus: 'CHARGING',
          remainingChargingMinutes: 30,
        },
      });
      store.set(STORE_KEY_LAST_DATA_UPDATE, NOW.getTime() - 5 * MINUTE);

      expect(vehicle.getBatteryWidgetState()).toEqual({
        deviceId: 'TEST_VIN_123',
        name: 'My i4',
        percent: 61,
        charge: 'CHARGING',
        range: 300,
        rangeUnit: 'km',
        fullAt: NOW.getTime() - 5 * MINUTE + 30 * MINUTE,
        updatedAt: NOW.getTime() - 5 * MINUTE,
      });
    });

    it('should_useTheDistanceUnitSetting', () => {
      mockSettings.distanceUnit = 'imperial';
      vehicle.currentVehicleState = statusOf({ range: 250 });

      const state = vehicle.getBatteryWidgetState();

      expect(state.range).toBe(155);
      expect(state.rangeUnit).toBe('mi');
    });

    it('should_prefer_theInMemoryCarDataTimeToTheStoredOne', () => {
      store.set(STORE_KEY_LAST_DATA_UPDATE, NOW.getTime() - 10 * MINUTE);
      vehicle['_lastDataUpdateMs'] = NOW.getTime() - MINUTE;

      expect(vehicle.getBatteryWidgetState().updatedAt).toBe(NOW.getTime() - MINUTE);
    });

    it('should_haveNoBatteryLevel_when_thereIsNoStatusYet', () => {
      vehicle.currentVehicleState = null;

      const state = vehicle.getBatteryWidgetState();

      expect(state.percent).toBeUndefined();
      expect(state.charge).toBe('UNKNOWN');
      expect(state.updatedAt).toBeUndefined();
    });
  });

  describe('realtime updates', () => {
    it('should_pushTheStateAfterTheStatusWasApplied', async () => {
      realtime.mockImplementation(() => {
        // By now the status is the current one
        expect(vehicle.currentVehicleState?.electric?.chargeLevelPercent).toBe(60);
        return Promise.resolve();
      });

      await receive(statusOf());

      expect(realtime).toHaveBeenCalledTimes(1);
      expect(realtime).toHaveBeenCalledWith(BATTERY_WIDGET_EVENT, vehicle.getBatteryWidgetState());
      expect(realtime.mock.calls[0][0]).toBe('battery-widget:update');
    });

    it('should_notPushAgain_when_theSameStatusArrivesAgain', async () => {
      await receive(statusOf());
      await receive(statusOf());

      expect(realtime).toHaveBeenCalledTimes(1);
    });

    it('should_pushRightAway_when_theBatteryLevelChanges', async () => {
      await receive(statusOf({ electric: { chargeLevelPercent: 60 } }));
      await receive(statusOf({ electric: { chargeLevelPercent: 61 } }));

      expect(emitted().map((state) => state.percent)).toEqual([60, 61]);
    });

    it('should_pushRightAway_when_chargingStarts', async () => {
      await receive(statusOf());
      await receive(statusOf({ electric: { chargingStatus: 'CHARGING' } }));

      expect(emitted().map((state) => state.charge)).toEqual(['PLUGGED_IN', 'CHARGING']);
    });

    it('should_pushRightAway_when_theRangeChanges', async () => {
      await receive(statusOf({ range: 300 }));
      await receive(statusOf({ range: 298 }));

      expect(emitted().map((state) => state.range)).toEqual([300, 298]);
    });

    it('should_pushStatusChangesWithTheNewDistanceUnit_whenSettingsChange', async () => {
      await receive(statusOf({ range: 250 }));
      vehicle['stateManager'].getVehicleStatus = jest
        .fn()
        .mockReturnValue(statusOf({ range: 250 }));
      vehicle['setDistanceUnits'] = jest.fn().mockResolvedValue(undefined);
      vehicle['setFuelUnits'] = jest.fn().mockResolvedValue(undefined);

      // Homey has not stored the new setting yet: getSettings still says metric
      await vehicle.onSettings({
        newSettings: { ...mockSettings, distanceUnit: 'imperial' },
        changedKeys: ['distanceUnit'],
      });

      expect(emitted().map((state) => [state.range, state.rangeUnit])).toEqual([
        [250, 'km'],
        [155, 'mi'],
      ]);
    });

    it('should_notPush_when_aSettingThatTheWidgetIgnoresChanges', async () => {
      await receive(statusOf());
      vehicle['setFuelUnits'] = jest.fn().mockResolvedValue(undefined);
      vehicle['stateManager'].getVehicleStatus = jest.fn().mockReturnValue(statusOf());

      await vehicle.onSettings({
        newSettings: { ...mockSettings, fuelUnit: 'gallonUS' },
        changedKeys: ['fuelUnit'],
      });

      expect(realtime).toHaveBeenCalledTimes(1);
    });

    it('should_pushTheNewName_when_theDeviceIsRenamed', async () => {
      await receive(statusOf());
      // Homey passes the new name; do not rely on getName() already returning it
      vehicle.onRenamed('Family car');
      await jest.advanceTimersByTimeAsync(0);

      expect(emitted().map((state) => state.name)).toEqual(['My i4', 'Family car']);
    });

    it('should_notPushTwice_when_updatesOverlap', async () => {
      vehicle.currentVehicleState = statusOf();

      await Promise.all([vehicle['emitBatteryWidgetState'](), vehicle['emitBatteryWidgetState']()]);

      expect(realtime).toHaveBeenCalledTimes(1);
    });

    describe('car data time', () => {
      it('should_pushTheFirstCarDataTime', async () => {
        vehicle.currentVehicleState = statusOf();

        await recordNow();

        expect(emitted()).toHaveLength(1);
        expect(emitted()[0].updatedAt).toBe(NOW.getTime());
      });

      it('should_notPush_when_newerDataIsLessThanAMinuteNewer', async () => {
        await recordNow();
        advance(59 * SECOND);

        await recordNow();

        expect(realtime).toHaveBeenCalledTimes(1);
      });

      it('should_push_when_newerDataIsAMinuteNewer', async () => {
        await recordNow();
        advance(MINUTE);

        await recordNow();

        expect(emitted().map((state) => state.updatedAt)).toEqual([
          NOW.getTime(),
          NOW.getTime() + MINUTE,
        ]);
      });

      it('should_measureAMinuteFromTheLastPush_notFromTheLastMessage', async () => {
        await recordNow(); // pushed
        advance(40 * SECOND);
        await recordNow(); // 40 s: not pushed
        advance(40 * SECOND);
        await recordNow(); // 80 s since the last push

        expect(emitted().map((state) => state.updatedAt)).toEqual([
          NOW.getTime(),
          NOW.getTime() + 80 * SECOND,
        ]);
      });

      it('should_notPush_when_olderDataIsIgnored', async () => {
        await recordNow();

        await vehicle['recordCarDataUpdate'](NOW.getTime() - 10 * MINUTE);

        expect(realtime).toHaveBeenCalledTimes(1);
      });

      it('should_pushAfterAnMqttMessage_whenItsDataIsAMinuteNewer', async () => {
        const messageAt = (time: number) =>
          ({
            vin: 'TEST_VIN_123',
            topic: 'gcid/TEST_VIN_123',
            timestamp: new Date(time).toISOString(),
            data: {},
          }) as unknown as StreamMessage;

        advance(-10 * MINUTE);
        await vehicle['handleMqttMessage']('t', messageAt(Date.now()));
        advance(10 * MINUTE);
        await vehicle['handleMqttMessage']('t', messageAt(Date.now()));

        expect(emitted().map((state) => state.updatedAt)).toEqual([
          NOW.getTime() - 10 * MINUTE,
          NOW.getTime(),
        ]);
      });

      it('should_pushAfterAnApiPoll_whenItsDataIsAMinuteNewer', async () => {
        vehicle['ensureContainer'] = jest.fn().mockResolvedValue('container-1');
        const poll = (time: number) => {
          vehicle['_carDataClient'] = {
            getRawTelematicData: jest.fn().mockResolvedValue({
              'vehicle.key': { timestamp: new Date(time).toISOString(), value: 1 },
            }),
          } as any;
          return vehicle['executePoll']();
        };

        await poll(Date.now() - 10 * MINUTE);
        await poll(Date.now());

        expect(emitted().map((state) => state.updatedAt)).toEqual([
          NOW.getTime() - 10 * MINUTE,
          NOW.getTime(),
        ]);
      });

      it('should_pushTheStatusAfterTheTimeStayedBehind', async () => {
        // An MQTT batch is applied about a second after its messages were recorded
        await recordNow();
        advance(SECOND);

        await receive(statusOf({ electric: { chargeLevelPercent: 59 } }));

        expect(emitted().map((state) => [state.percent, state.updatedAt])).toEqual([
          [undefined, NOW.getTime()],
          [59, NOW.getTime()],
        ]);
      });
    });

    describe('fullAt while charging', () => {
      const charging = (minutes: number) =>
        statusOf({ electric: { chargingStatus: 'CHARGING', remainingChargingMinutes: minutes } });

      it('should_notPush_when_onlyFullAtMovesWithEachMeasurement', async () => {
        await recordNow();
        await receive(charging(60));

        // 20 s later the car measures again: updatedAt and fullAt move together
        advance(20 * SECOND);
        await recordNow();
        await receive(charging(60));

        expect(realtime).toHaveBeenCalledTimes(2);
        expect(emitted()[1].fullAt).toBe(NOW.getTime() + 60 * MINUTE);
      });
    });

    describe('failures', () => {
      it('should_notThrow_andLogAWarning_when_pushingFails', async () => {
        realtime.mockRejectedValue(new Error('realtime down'));

        await expect(receive(statusOf())).resolves.toBeUndefined();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            'Failed to push the battery widget state for vehicle TEST_VIN_123'
          )
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('realtime down'));
      });

      it('should_notThrow_when_realtimeThrowsSynchronously', async () => {
        realtime.mockImplementation(() => {
          throw new Error('boom');
        });

        await expect(receive(statusOf())).resolves.toBeUndefined();

        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      });

      it('should_pushAgainOnTheNextUpdate_when_theLastPushFailed', async () => {
        realtime.mockRejectedValueOnce(new Error('realtime down'));
        await receive(statusOf());

        // Nothing changed, but the widget never got the state
        await receive(statusOf());

        expect(realtime).toHaveBeenCalledTimes(2);
        expect(emitted()[0]).toEqual(emitted()[1]);
      });

      it('should_notThrow_when_theStateCannotBeRead', async () => {
        vehicle.getName = jest.fn(() => {
          throw new Error('device gone');
        });

        await expect(receive(statusOf())).resolves.toBeUndefined();
        await expect(recordNow()).resolves.toBeUndefined();

        expect(realtime).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('device gone'));
      });

      it('should_keepRecordingTheCarDataTime_when_pushingFails', async () => {
        realtime.mockRejectedValue(new Error('realtime down'));

        await recordNow();

        expect(store.get(STORE_KEY_LAST_DATA_UPDATE)).toBe(NOW.getTime());
        expect(vehicle['_lastDataUpdateMs']).toBe(NOW.getTime());
      });

      it('should_notThrow_when_homeyHasNoApiManager', async () => {
        (vehicle.homey as any).api = undefined;

        await expect(receive(statusOf())).resolves.toBeUndefined();

        expect(mockLogger.warn).toHaveBeenCalled();
      });
    });
  });
});
