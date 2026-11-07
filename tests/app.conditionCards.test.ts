/**
 * Tests for the flow condition cards registered by the app
 *
 * The shared Homey mock has no default export and no SimpleClass, which the app and its loggers
 * extend, so the module is extended with minimal ones here.
 */

jest.mock('homey', () => ({
  ...jest.requireActual('./__mocks__/homey'),
  __esModule: true,
  default: { App: class {} },
  SimpleClass: class {},
}));

import * as fs from 'fs';
import * as path from 'path';
import type { BMWConnectedDrive } from '../app';
import { Flows } from '../utils/Flows';

// app.ts ends with `module.exports = BMWConnectedDrive`, so the class is the module itself
const AppClass = jest.requireActual<typeof BMWConnectedDrive>('../app');

type RunListener = (args: any, state?: any) => unknown;

describe('BMWConnectedDrive condition cards', () => {
  let runListeners: Map<string, RunListener>;
  let getConditionCard: jest.Mock;

  beforeEach(() => {
    runListeners = new Map();
    getConditionCard = jest.fn((id: string) => ({
      registerRunListener: jest.fn((listener: RunListener) => {
        runListeners.set(id, listener);
      }),
      registerArgumentAutocompleteListener: jest.fn(),
    }));

    const app = Object.create(AppClass.prototype) as BMWConnectedDrive;
    (app as any).homey = { flow: { getConditionCard } };
    app['registerConditionCards']();
  });

  describe('car_data_stream_live', () => {
    it('should_registerARunListener_when_appStarts', () => {
      expect(Flows.CAR_DATA_STREAM_LIVE_CONDITION).toBe('car_data_stream_live');
      expect(getConditionCard).toHaveBeenCalledWith(Flows.CAR_DATA_STREAM_LIVE_CONDITION);
      expect(runListeners.has(Flows.CAR_DATA_STREAM_LIVE_CONDITION)).toBe(true);
    });

    it.each([true, false])('should_returnWhatTheDeviceReports_when_streamLiveIs_%s', (live) => {
      const device = { isCarDataStreamLive: jest.fn().mockReturnValue(live) };

      const result = runListeners.get(Flows.CAR_DATA_STREAM_LIVE_CONDITION)?.({ device });

      expect(result).toBe(live);
      expect(device.isCarDataStreamLive).toHaveBeenCalledTimes(1);
    });
  });

  describe('car_data_stream_live card definition', () => {
    const card = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../.homeycompose/flow/conditions/car_data_stream_live.json'),
        'utf8'
      )
    );

    it('should_matchTheFlowsConstantAndTargetBmwAndMiniDevices', () => {
      expect(card.id).toBe(Flows.CAR_DATA_STREAM_LIVE_CONDITION);
      expect(card.args).toEqual([{ name: 'device', type: 'device', filter: 'driver_id=bmw|mini' }]);
    });

    it('should_beTranslatedAndExplainedInEnglishAndDutch', () => {
      expect(card.title.en).toBe("Car data stream !{{is|isn't}} live");
      expect(card.title.nl).toBe('Autodata-stream !{{is|is niet}} live');
      expect(card.hint.en).toContain('within seconds');
      expect(card.hint.nl).toContain('enkele seconden');
    });
  });

  describe.each([
    {
      cardId: Flows.CAR_IS_LOCKED_CONDITION,
      expectedId: 'car_is_locked',
      method: 'getCarLockStatus',
      yes: 'LOCKED',
      no: 'UNLOCKED',
      unknownMessage: "The car's lock state isn't known yet",
    },
    {
      cardId: Flows.CHARGING_CABLE_IS_CONNECTED_CONDITION,
      expectedId: 'charging_cable_is_connected',
      method: 'getChargingCableStatus',
      yes: 'CONNECTED',
      no: 'DISCONNECTED',
      unknownMessage: "The charging cable state isn't known yet",
    },
  ])('$expectedId', ({ cardId, expectedId, method, yes, no, unknownMessage }) => {
    const askTheDevice = (status: string) => {
      const device = { [method]: jest.fn().mockReturnValue(status) };
      return { device, run: () => runListeners.get(cardId)?.({ device }) };
    };

    it('should_registerARunListener_when_appStarts', () => {
      expect(cardId).toBe(expectedId);
      expect(getConditionCard).toHaveBeenCalledWith(cardId);
      expect(runListeners.has(cardId)).toBe(true);
    });

    it('should_returnTrue_when_theDeviceReports_' + yes, () => {
      const { device, run } = askTheDevice(yes);

      expect(run()).toBe(true);
      expect(device[method]).toHaveBeenCalledTimes(1);
    });

    it('should_returnFalse_when_theDeviceReports_' + no, () => {
      const { run } = askTheDevice(no);

      expect(run()).toBe(false);
    });

    it('should_throwInsteadOfGuessing_when_theStateIsUnknown', () => {
      const { run } = askTheDevice('UNKNOWN');

      expect(run).toThrow(Error);
      expect(run).toThrow(unknownMessage);
    });

    it('should_pointTheUserAtWhatToDoNext_when_theStateIsUnknown', () => {
      const { run } = askTheDevice('UNKNOWN');

      expect(run).toThrow(/nothing you need to do/i);
    });

    describe('card definition', () => {
      const card = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, `../.homeycompose/flow/conditions/${expectedId}.json`),
          'utf8'
        )
      );

      it('should_matchTheFlowsConstantAndTargetBmwAndMiniDevices', () => {
        expect(card.id).toBe(cardId);
        expect(card.args).toEqual([
          { name: 'device', type: 'device', filter: 'driver_id=bmw|mini' },
        ]);
      });

      it('should_explainWhereTheDataComesFromInEnglishAndDutch', () => {
        expect(card.hint.en).toContain('BMW CarData');
        expect(card.hint.en).toContain('stream selection');
        expect(card.hint.nl).toContain('BMW CarData');
        expect(card.hint.nl).toContain('streamselectie');
      });
    });
  });

  describe('card titles', () => {
    const readCard = (id: string) =>
      JSON.parse(
        fs.readFileSync(path.join(__dirname, `../.homeycompose/flow/conditions/${id}.json`), 'utf8')
      );

    it('should_beTranslatedInEnglishAndDutch', () => {
      expect(readCard('car_is_locked').title).toEqual({
        en: "The car !{{is|isn't}} locked",
        nl: 'De auto !{{is|is niet}} vergrendeld',
      });
      expect(readCard('charging_cable_is_connected').title).toEqual({
        en: "A charging cable !{{is|isn't}} plugged in",
        nl: 'Er !{{is|is geen}} laadkabel aangesloten',
      });
    });
  });

  describe('car_data_fresh', () => {
    it('should_askTheDeviceWithTheMinutesAsNumber_when_conditionRuns', () => {
      const device = { isCarDataFresh: jest.fn().mockReturnValue(true) };

      const result = runListeners.get(Flows.CAR_DATA_FRESH_CONDITION)?.({ device, minutes: '30' });

      expect(result).toBe(true);
      expect(device.isCarDataFresh).toHaveBeenCalledWith(30);
    });
  });

  /**
   * Homey inverts the result of a condition for its "isn't" variant, so a condition that returns
   * false or undefined when it does not know the answer makes the inverted card say yes. These
   * conditions therefore throw when the data is unknown.
   */
  describe('battery_percentage', () => {
    const batteryDevice = (level: unknown, hasCapability = true) => ({
      hasCapability: jest.fn().mockReturnValue(hasCapability),
      getCapabilityValue: jest.fn().mockResolvedValue(level),
    });
    const run = (level: unknown, test: number, hasCapability = true) => {
      const device = batteryDevice(level, hasCapability);
      return {
        device,
        result: () =>
          runListeners.get(Flows.BATTERY_PERCENTAGE_CONDITION)?.({
            device,
            battery_charge_test: test,
          }) as Promise<boolean>,
      };
    };

    it('should_registerARunListener_when_appStarts', () => {
      expect(getConditionCard).toHaveBeenCalledWith(Flows.BATTERY_PERCENTAGE_CONDITION);
      expect(runListeners.has(Flows.BATTERY_PERCENTAGE_CONDITION)).toBe(true);
    });

    it.each([
      [40, 50, true],
      [49, 50, true],
      [50, 50, false],
      [51, 50, false],
      [100, 50, false],
      [99.5, 100, true],
    ])('should_compareTheLevel_%s_withTheTest_%s_and_return_%s', async (level, test, expected) => {
      const { device, result } = run(level, test);

      await expect(result()).resolves.toBe(expected);
      expect(device.getCapabilityValue).toHaveBeenCalledWith('measure_battery');
    });

    it('should_treatZeroAsAValidLevel_when_theBatteryIsEmpty', async () => {
      // 0 used to be falsy, so an empty battery was neither "less than" nor an error
      await expect(run(0, 10).result()).resolves.toBe(true);
      await expect(run(0, 0).result()).resolves.toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a numeric string', '50'],
      ['an object', {}],
    ])('should_throwInsteadOfGuessing_when_theLevelIs_%s', async (_name, level) => {
      await expect(run(level, 50).result()).rejects.toThrow(Error);
      await expect(run(level, 50).result()).rejects.toThrow("The battery level isn't known yet");
    });

    it('should_throwInsteadOfGuessing_when_theDeviceHasNoBatteryCapability', async () => {
      const { device, result } = run(undefined, 50, false);

      await expect(result()).rejects.toThrow("The battery level isn't known yet");
      expect(device.getCapabilityValue).not.toHaveBeenCalled();
    });

    it('should_pointTheUserAtWhatToDoNext_when_theLevelIsUnknown', async () => {
      await expect(run(undefined, 50).result()).rejects.toThrow(/nothing you need to do/i);
      await expect(run(undefined, 50).result()).rejects.toThrow(
        'vehicle.drivetrain.batteryManagement.header'
      );
    });
  });

  describe('charging_status', () => {
    const run = (state: unknown, expectedState: string, hasCapability = true) => {
      const device = {
        hasCapability: jest.fn().mockReturnValue(hasCapability),
        getCapabilityValue: jest.fn().mockResolvedValue(state),
      };
      return {
        device,
        result: () =>
          runListeners.get(Flows.CHARGING_STATUS_CONDITION)?.({
            device,
            charging_state: expectedState,
          }) as Promise<boolean>,
      };
    };

    it('should_registerARunListener_when_appStarts', () => {
      expect(getConditionCard).toHaveBeenCalledWith(Flows.CHARGING_STATUS_CONDITION);
      expect(runListeners.has(Flows.CHARGING_STATUS_CONDITION)).toBe(true);
    });

    it.each(['plugged_in_charging', 'plugged_in_paused', 'plugged_in', 'plugged_out'])(
      'should_returnTrue_when_theChargingStateIs_%s_andIsTheSelectedOne',
      async (state) => {
        const { device, result } = run(state, state);

        await expect(result()).resolves.toBe(true);
        expect(device.getCapabilityValue).toHaveBeenCalledWith('ev_charging_state');
      }
    );

    it.each([
      ['plugged_in', 'plugged_in_paused'],
      ['plugged_in_paused', 'plugged_in'],
      ['plugged_out', 'plugged_in'],
      ['plugged_in_charging', 'plugged_out'],
    ])('should_returnFalse_when_theChargingStateIs_%s_andTheSelectedOneIs_%s', async (a, b) => {
      await expect(run(a, b).result()).resolves.toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
    ])('should_throwInsteadOfGuessing_when_theChargingStateIs_%s', async (_name, state) => {
      await expect(run(state, 'plugged_out').result()).rejects.toThrow(Error);
      await expect(run(state, 'plugged_out').result()).rejects.toThrow(
        "The charging state isn't known yet"
      );
    });

    it('should_throwInsteadOfGuessing_when_theDeviceHasNoChargingStateCapability', async () => {
      const { device, result } = run('plugged_in', 'plugged_in', false);

      await expect(result()).rejects.toThrow("The charging state isn't known yet");
      expect(device.getCapabilityValue).not.toHaveBeenCalled();
    });

    it('should_pointTheUserAtWhatToDoNext_when_theChargingStateIsUnknown', async () => {
      await expect(run(undefined, 'plugged_in').result()).rejects.toThrow(
        /nothing you need to do/i
      );
      await expect(run(undefined, 'plugged_in').result()).rejects.toThrow(
        'vehicle.body.chargingPort.status'
      );
    });
  });

  describe('geofence', () => {
    const run = (location: unknown, geoFence: unknown = { id: 'Home', name: 'Home' }) => {
      const device = { stateManager: { getLastLocation: jest.fn().mockReturnValue(location) } };
      return {
        device,
        result: () =>
          runListeners.get(Flows.GEOFENCE_CONDITION)?.({
            device,
            geo_fence: geoFence,
          }) as Promise<boolean>,
      };
    };

    it('should_registerARunListener_when_appStarts', () => {
      expect(getConditionCard).toHaveBeenCalledWith(Flows.GEOFENCE_CONDITION);
      expect(runListeners.has(Flows.GEOFENCE_CONDITION)).toBe(true);
    });

    it('should_returnTrue_when_theCarIsInsideTheSelectedGeofence', async () => {
      const { device, result } = run({ label: 'Home', latitude: 1, longitude: 2, address: '' });

      await expect(result()).resolves.toBe(true);
      expect(device.stateManager.getLastLocation).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['inside another geofence', 'Work'],
      ['outside every geofence', ''],
    ])('should_returnFalse_when_theCarIs_%s', async (_name, label) => {
      const { result } = run({ label, latitude: 1, longitude: 2, address: '' });

      await expect(result()).resolves.toBe(false);
    });

    it('should_returnFalse_when_noGeofenceIsSelected', async () => {
      const { result } = run({ label: 'Home', latitude: 1, longitude: 2, address: '' }, { id: '' });

      await expect(result()).resolves.toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
    ])('should_throwInsteadOfGuessing_when_theLastLocationIs_%s', async (_name, location) => {
      const { result } = run(location);

      await expect(result()).rejects.toThrow(Error);
      await expect(result()).rejects.toThrow("The car's location isn't known yet");
    });

    it('should_pointTheUserAtWhatToDoNext_when_theLocationIsUnknown', async () => {
      const { result } = run(undefined);

      await expect(result()).rejects.toThrow(/nothing you need to do/i);
      await expect(result()).rejects.toThrow(
        'vehicle.cabin.infotainment.navigation.currentLocation.latitude'
      );
    });
  });
});
