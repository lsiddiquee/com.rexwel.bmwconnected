/**
 * Tests for the state of the "Car battery" dashboard widget: how it is built from the vehicle
 * status, and when a changed state is pushed to the widget again.
 */

import type { ElectricVehicleState, VehicleStatus } from '../../lib/models/VehicleStatus';
import {
  BATTERY_WIDGET_EVENT,
  BATTERY_WIDGET_REFRESH_INTERVAL_MS,
  BatteryWidgetState,
  buildBatteryWidgetState,
  shouldEmitBatteryWidgetState,
} from '../../utils/BatteryWidgetState';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const MINUTE = 60 * 1000;

/** A status with only the fields the widget reads. Everything else is irrelevant to it. */
const status = (
  overrides: Partial<Omit<VehicleStatus, 'electric'>> & {
    electric?: Partial<ElectricVehicleState> | null;
  } = {}
): VehicleStatus => {
  const { electric, ...rest } = overrides;
  return {
    vin: 'VIN1',
    chargingCable: 'UNKNOWN',
    ...rest,
    // null leaves the status without electric data, like a combustion car
    ...(electric === null
      ? {}
      : {
          electric: {
            range: 0,
            isChargerConnected: false,
            chargingStatus: 'UNKNOWN',
            ...electric,
          },
        }),
  } as VehicleStatus;
};

const build = (
  overrides: {
    name?: string;
    status?: VehicleStatus | undefined;
    distanceUnit?: string;
    updatedAt?: number | undefined;
    now?: number;
  } = {}
): BatteryWidgetState =>
  buildBatteryWidgetState({
    deviceId: 'VIN1',
    name: 'My i4',
    status: status(),
    distanceUnit: 'metric',
    updatedAt: NOW - MINUTE,
    now: NOW,
    ...overrides,
  });

describe('BatteryWidgetState', () => {
  it('should_useTheRealtimeEventNameTheWidgetListensTo', () => {
    expect(BATTERY_WIDGET_EVENT).toBe('battery-widget:update');
  });

  describe('buildBatteryWidgetState', () => {
    describe('identity and time', () => {
      it('should_passThroughDeviceIdNameAndUpdatedAt', () => {
        const result = build({ updatedAt: NOW - 5 * MINUTE });

        expect(result.deviceId).toBe('VIN1');
        expect(result.name).toBe('My i4');
        expect(result.updatedAt).toBe(NOW - 5 * MINUTE);
      });

      it.each([
        ['iX3 M Sport (VIN1)', 'iX3 M Sport'],
        ['iX3 M Sport (OTHERVIN)', 'iX3 M Sport (OTHERVIN)'],
        ['(VIN1)', '(VIN1)'],
        [' (VIN1)', ' (VIN1)'],
        ['VIN1', 'VIN1'],
        ['My car (VIN1) at home', 'My car (VIN1) at home'],
      ])('should_leaveOutTheVinPairingAppends_when_nameIs_%s', (name, expected) => {
        expect(build({ name }).name).toBe(expected);
      });

      it('should_leaveUpdatedAtUndefined_when_theCarNeverReportedData', () => {
        expect(build({ updatedAt: undefined }).updatedAt).toBeUndefined();
      });

      it('should_notHaveADrivingField', () => {
        expect(build()).not.toHaveProperty('driving');
      });

      it('should_beJsonSerializable_withoutUndefinedFields', () => {
        const result = build({ status: undefined, updatedAt: undefined });

        expect(JSON.parse(JSON.stringify(result))).toEqual({
          deviceId: 'VIN1',
          name: 'My i4',
          charge: 'UNKNOWN',
          rangeUnit: 'km',
        });
      });
    });

    describe('percent', () => {
      it.each([
        [80, 80],
        [84.4, 84],
        [84.5, 85],
        [84.6, 85],
        [0, 0],
        [0.4, 0],
        [100, 100],
      ])('should_roundTheLevel_when_levelIs%s', (level, expected) => {
        const result = build({ status: status({ electric: { chargeLevelPercent: level } }) });

        expect(result.percent).toBe(expected);
      });

      it.each([
        [100.4, 100],
        [120, 100],
        [Number.MAX_SAFE_INTEGER, 100],
        [-0.4, 0],
        [-5, 0],
      ])('should_clampTo0To100_when_levelIs%s', (level, expected) => {
        const result = build({ status: status({ electric: { chargeLevelPercent: level } }) });

        expect(result.percent).toBe(expected);
      });

      it('should_reportZeroAsZero_notAsUnknown', () => {
        const result = build({ status: status({ electric: { chargeLevelPercent: 0 } }) });

        expect(result.percent).toBe(0);
      });

      it.each([
        ['not reported', undefined],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['-Infinity', Number.NEGATIVE_INFINITY],
        ['not a number', '80' as unknown as number],
        ['null', null as unknown as number],
      ])('should_beUndefined_when_levelIs%s', (_label, level) => {
        const result = build({ status: status({ electric: { chargeLevelPercent: level } }) });

        expect(result.percent).toBeUndefined();
      });

      it('should_beUndefined_when_statusHasNoElectricData', () => {
        expect(build({ status: status({ electric: null }) }).percent).toBeUndefined();
      });

      it('should_beUndefined_when_thereIsNoStatus', () => {
        expect(build({ status: undefined }).percent).toBeUndefined();
      });
    });

    describe('charge', () => {
      it.each([
        ['CHARGING', 'NOT_PLUGGED_IN'],
        ['PAUSED', 'NOT_PLUGGED_IN'],
        ['NOT_CHARGING', 'NOT_PLUGGED_IN'],
        ['UNKNOWN', 'NOT_PLUGGED_IN'],
      ])(
        'should_beNotPluggedIn_when_cableIsDisconnectedAndChargingStatusIs%s',
        (chargingStatus, expected) => {
          const result = build({
            status: status({
              chargingCable: 'DISCONNECTED',
              electric: {
                chargingStatus: chargingStatus as ElectricVehicleState['chargingStatus'],
              },
            }),
          });

          expect(result.charge).toBe(expected);
        }
      );

      it('should_beNotPluggedIn_when_cableIsDisconnectedAndThereIsNoElectricData', () => {
        const result = build({ status: status({ chargingCable: 'DISCONNECTED', electric: null }) });

        expect(result.charge).toBe('NOT_PLUGGED_IN');
      });

      it.each(['CONNECTED', 'UNKNOWN'] as const)(
        'should_beCharging_when_chargingStatusIsCharging_andCableIs%s',
        (cable) => {
          const result = build({
            status: status({ chargingCable: cable, electric: { chargingStatus: 'CHARGING' } }),
          });

          expect(result.charge).toBe('CHARGING');
        }
      );

      it.each([
        'NOT_CHARGING',
        'PAUSED',
        'COMPLETE',
        'INITIALIZING',
        'ERROR',
        'INVALID',
        'UNKNOWN',
      ])('should_bePluggedIn_when_cableIsConnectedAndChargingStatusIs%s', (chargingStatus) => {
        const result = build({
          status: status({
            chargingCable: 'CONNECTED',
            electric: { chargingStatus: chargingStatus as ElectricVehicleState['chargingStatus'] },
          }),
        });

        expect(result.charge).toBe('PLUGGED_IN');
      });

      it('should_bePluggedIn_when_cableIsConnectedAndThereIsNoElectricData', () => {
        const result = build({ status: status({ chargingCable: 'CONNECTED', electric: null }) });

        expect(result.charge).toBe('PLUGGED_IN');
      });

      it.each(['NOT_CHARGING', 'PAUSED', 'COMPLETE', 'UNKNOWN'])(
        'should_beUnknown_when_cableIsUnknownAndChargingStatusIs%s',
        (chargingStatus) => {
          const result = build({
            status: status({
              chargingCable: 'UNKNOWN',
              electric: {
                chargingStatus: chargingStatus as ElectricVehicleState['chargingStatus'],
              },
            }),
          });

          expect(result.charge).toBe('UNKNOWN');
        }
      );

      it('should_beUnknown_when_thereIsNoStatus', () => {
        expect(build({ status: undefined }).charge).toBe('UNKNOWN');
      });
    });

    describe('range', () => {
      it('should_useTheTotalRange_whenItIsReported', () => {
        const result = build({
          status: status({ range: 312, electric: { range: 280 } }),
        });

        expect(result.range).toBe(312);
        expect(result.rangeUnit).toBe('km');
      });

      it('should_fallBackToTheElectricRange_when_noTotalRange', () => {
        const result = build({ status: status({ electric: { range: 280 } }) });

        expect(result.range).toBe(280);
      });

      it('should_notFallBack_when_totalRangeIsZero', () => {
        // A finite total range is a report, also an empty one
        const result = build({ status: status({ range: 0, electric: { range: 280 } }) });

        expect(result.range).toBe(0);
      });

      it.each([Number.NaN, Number.POSITIVE_INFINITY, -10])(
        'should_fallBackToTheElectricRange_when_totalRangeIs%s',
        (total) => {
          const result = build({ status: status({ range: total, electric: { range: 280 } }) });

          expect(result.range).toBe(280);
        }
      );

      it('should_beUndefined_when_electricRangeIsZero', () => {
        // The transformer writes 0 when the car reported no electric range
        expect(build({ status: status({ electric: { range: 0 } }) }).range).toBeUndefined();
      });

      it.each([Number.NaN, Number.POSITIVE_INFINITY, -10])(
        'should_beUndefined_when_electricRangeIs%s',
        (electricRange) => {
          const result = build({ status: status({ electric: { range: electricRange } }) });

          expect(result.range).toBeUndefined();
        }
      );

      it('should_beUndefined_when_noRangeAtAll', () => {
        expect(build({ status: status({ electric: null }) }).range).toBeUndefined();
        expect(build({ status: undefined }).range).toBeUndefined();
      });

      it('should_roundTheRange', () => {
        expect(build({ status: status({ range: 312.6 }) }).range).toBe(313);
        expect(build({ status: status({ range: 312.4 }) }).range).toBe(312);
      });

      it('should_convertTheTotalRangeToMiles_when_unitIsNotMetric', () => {
        const result = build({ distanceUnit: 'imperial', status: status({ range: 250 }) });

        expect(result.range).toBe(155); // 250 km = 155.3 mi
        expect(result.rangeUnit).toBe('mi');
      });

      it('should_convertTheElectricRangeToMiles_when_unitIsNotMetric', () => {
        const result = build({
          distanceUnit: 'imperial',
          status: status({ electric: { range: 400 } }),
        });

        expect(result.range).toBe(249); // 400 km = 248.5 mi
        expect(result.rangeUnit).toBe('mi');
      });

      it.each(['imperial', 'us', 'uk', 'anything'])(
        'should_useMiles_when_distanceUnitIs%s',
        (distanceUnit) => {
          expect(build({ distanceUnit }).rangeUnit).toBe('mi');
        }
      );

      it('should_useKilometers_when_distanceUnitIsMetric', () => {
        expect(build({ distanceUnit: 'metric' }).rangeUnit).toBe('km');
      });

      it('should_stillReportTheUnit_when_theRangeIsUnknown', () => {
        const result = build({ distanceUnit: 'imperial', status: undefined });

        expect(result.range).toBeUndefined();
        expect(result.rangeUnit).toBe('mi');
      });
    });

    describe('fullAt', () => {
      const charging = (minutes: number | undefined) =>
        status({
          chargingCable: 'CONNECTED',
          electric: { chargingStatus: 'CHARGING', remainingChargingMinutes: minutes },
        });

      it('should_addTheRemainingMinutesToTheTimeTheCarMeasuredThem', () => {
        const updatedAt = NOW - 10 * MINUTE;

        const result = build({ status: charging(45), updatedAt });

        // 45 minutes from when the car measured it, not from now
        expect(result.fullAt).toBe(updatedAt + 45 * MINUTE);
      });

      it('should_acceptFractionalMinutes', () => {
        const result = build({ status: charging(30.5), updatedAt: NOW });

        expect(result.fullAt).toBe(NOW + 30.5 * MINUTE);
      });

      it('should_beUndefined_when_theFinishTimeIsInThePast', () => {
        // Measured 50 minutes ago, 45 minutes to go: it should have finished 5 minutes ago
        const result = build({ status: charging(45), updatedAt: NOW - 50 * MINUTE });

        expect(result.fullAt).toBeUndefined();
        expect(result.charge).toBe('CHARGING');
      });

      it('should_beUndefined_when_theFinishTimeIsExactlyNow', () => {
        const result = build({ status: charging(45), updatedAt: NOW - 45 * MINUTE });

        expect(result.fullAt).toBeUndefined();
      });

      it('should_keepTheFinishTime_when_itIsOneMillisecondAhead', () => {
        const result = build({ status: charging(45), updatedAt: NOW - 45 * MINUTE + 1 });

        expect(result.fullAt).toBe(NOW + 1);
      });

      it.each([
        ['not reported', undefined],
        ['zero', 0],
        ['negative', -5],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
      ])('should_beUndefined_when_remainingMinutesAre%s', (_label, minutes) => {
        const result = build({ status: charging(minutes), updatedAt: NOW });

        expect(result.fullAt).toBeUndefined();
      });

      it('should_beUndefined_when_theCarMeasuredNothingYet', () => {
        const result = build({ status: charging(45), updatedAt: undefined });

        expect(result.charge).toBe('CHARGING');
        expect(result.fullAt).toBeUndefined();
      });

      it.each(['PAUSED', 'NOT_CHARGING', 'COMPLETE'] as const)(
        'should_beUndefined_when_notCharging_andChargingStatusIs%s',
        (chargingStatus) => {
          const result = build({
            status: status({
              chargingCable: 'CONNECTED',
              electric: { chargingStatus, remainingChargingMinutes: 45 },
            }),
            updatedAt: NOW,
          });

          expect(result.charge).toBe('PLUGGED_IN');
          expect(result.fullAt).toBeUndefined();
        }
      );

      it('should_beUndefined_when_cableIsDisconnected_whateverTheChargingStatusSays', () => {
        const result = build({
          status: status({
            chargingCable: 'DISCONNECTED',
            electric: { chargingStatus: 'CHARGING', remainingChargingMinutes: 45 },
          }),
          updatedAt: NOW,
        });

        expect(result.charge).toBe('NOT_PLUGGED_IN');
        expect(result.fullAt).toBeUndefined();
      });

      it('should_beUndefined_when_thereIsNoStatus', () => {
        expect(build({ status: undefined, updatedAt: NOW }).fullAt).toBeUndefined();
      });
    });

    it('should_buildTheWholeState_forAChargingCar', () => {
      const result = build({
        status: status({
          range: 187,
          chargingCable: 'CONNECTED',
          electric: {
            chargeLevelPercent: 61.4,
            chargingStatus: 'CHARGING',
            remainingChargingMinutes: 90,
            range: 190,
          },
        }),
        distanceUnit: 'imperial',
        updatedAt: NOW - 2 * MINUTE,
      });

      expect(result).toEqual({
        deviceId: 'VIN1',
        name: 'My i4',
        percent: 61,
        charge: 'CHARGING',
        range: 116,
        rangeUnit: 'mi',
        fullAt: NOW - 2 * MINUTE + 90 * MINUTE,
        updatedAt: NOW - 2 * MINUTE,
      });
    });
  });

  describe('shouldEmitBatteryWidgetState', () => {
    const base = (overrides: Partial<BatteryWidgetState> = {}): BatteryWidgetState => ({
      deviceId: 'VIN1',
      name: 'My i4',
      percent: 61,
      charge: 'PLUGGED_IN',
      range: 187,
      rangeUnit: 'km',
      updatedAt: NOW,
      ...overrides,
    });

    it('should_emit_when_nothingWasEmittedBefore', () => {
      expect(shouldEmitBatteryWidgetState(undefined, base())).toBe(true);
    });

    it('should_notEmit_when_nothingChanged', () => {
      expect(shouldEmitBatteryWidgetState(base(), base())).toBe(false);
    });

    it('should_notEmit_when_onlyTheTimeMovedLessThanAMinute', () => {
      const next = base({ updatedAt: NOW + BATTERY_WIDGET_REFRESH_INTERVAL_MS - 1 });

      expect(shouldEmitBatteryWidgetState(base(), next)).toBe(false);
    });

    it('should_emit_when_updatedAtAdvancedByAMinute', () => {
      const next = base({ updatedAt: NOW + BATTERY_WIDGET_REFRESH_INTERVAL_MS });

      expect(shouldEmitBatteryWidgetState(base(), next)).toBe(true);
    });

    it('should_emit_when_updatedAtAdvancedByMoreThanAMinute', () => {
      expect(shouldEmitBatteryWidgetState(base(), base({ updatedAt: NOW + 10 * MINUTE }))).toBe(
        true
      );
    });

    it('should_emit_when_updatedAtMovedBackByAMinute_becauseTheClockSteppedBack', () => {
      const next = base({ updatedAt: NOW - BATTERY_WIDGET_REFRESH_INTERVAL_MS });

      expect(shouldEmitBatteryWidgetState(base(), next)).toBe(true);
    });

    it('should_notEmit_when_updatedAtMovedBackByLessThanAMinute', () => {
      const next = base({ updatedAt: NOW - BATTERY_WIDGET_REFRESH_INTERVAL_MS + 1 });

      expect(shouldEmitBatteryWidgetState(base(), next)).toBe(false);
    });

    it('should_emit_when_theCarReportedItsFirstData', () => {
      expect(
        shouldEmitBatteryWidgetState(base({ updatedAt: undefined }), base({ updatedAt: NOW }))
      ).toBe(true);
    });

    it('should_notEmit_when_stillNoData', () => {
      expect(
        shouldEmitBatteryWidgetState(base({ updatedAt: undefined }), base({ updatedAt: undefined }))
      ).toBe(false);
    });

    it.each<[string, Partial<BatteryWidgetState>]>([
      ['percent', { percent: 62 }],
      ['percent becoming unknown', { percent: undefined }],
      ['charge', { charge: 'CHARGING' }],
      ['range', { range: 186 }],
      ['range becoming unknown', { range: undefined }],
      ['range unit', { rangeUnit: 'mi' }],
      ['name', { name: 'Renamed' }],
      ['device', { deviceId: 'VIN2' }],
    ])('should_emitRightAway_when_%sChanged', (_label, change) => {
      expect(shouldEmitBatteryWidgetState(base(), base(change))).toBe(true);
    });

    it('should_emit_when_percentBecameZero', () => {
      expect(shouldEmitBatteryWidgetState(base({ percent: undefined }), base({ percent: 0 }))).toBe(
        true
      );
    });

    it('should_emitRightAway_when_aChangeComesWithATimeThatMovedLessThanAMinute', () => {
      const next = base({ percent: 62, updatedAt: NOW + 1000 });

      expect(shouldEmitBatteryWidgetState(base(), next)).toBe(true);
    });

    describe('fullAt', () => {
      const charging = (overrides: Partial<BatteryWidgetState> = {}) =>
        base({ charge: 'CHARGING', fullAt: NOW + 60 * MINUTE, ...overrides });

      it('should_notEmit_when_fullAtMovesWithAFreshMeasurement', () => {
        // A new message 20 s later: updatedAt and fullAt both move by 20 s
        const next = charging({ updatedAt: NOW + 20_000, fullAt: NOW + 60 * MINUTE + 20_000 });

        expect(shouldEmitBatteryWidgetState(charging(), next)).toBe(false);
      });

      it('should_notEmit_when_fullAtMovedLessThanAMinute', () => {
        const next = charging({
          fullAt: NOW + 60 * MINUTE + BATTERY_WIDGET_REFRESH_INTERVAL_MS - 1,
        });

        expect(shouldEmitBatteryWidgetState(charging(), next)).toBe(false);
      });

      it('should_emit_when_fullAtMovedByAMinute', () => {
        const next = charging({ fullAt: NOW + 60 * MINUTE + BATTERY_WIDGET_REFRESH_INTERVAL_MS });

        expect(shouldEmitBatteryWidgetState(charging(), next)).toBe(true);
      });

      it('should_emit_when_fullAtMovedBackByAMinute', () => {
        const next = charging({ fullAt: NOW + 60 * MINUTE - BATTERY_WIDGET_REFRESH_INTERVAL_MS });

        expect(shouldEmitBatteryWidgetState(charging(), next)).toBe(true);
      });

      it('should_emit_when_fullAtAppears', () => {
        expect(shouldEmitBatteryWidgetState(charging({ fullAt: undefined }), charging())).toBe(
          true
        );
      });

      it('should_emit_when_fullAtDisappears', () => {
        expect(shouldEmitBatteryWidgetState(charging(), charging({ fullAt: undefined }))).toBe(
          true
        );
      });

      it('should_compareAgainstTheLastEmittedState_soSlowDriftAddsUp', () => {
        // Every step is below a minute, but the widget last got the first one
        const emitted = charging();
        const steps = [30_000, 59_999, 60_000].map((drift) =>
          shouldEmitBatteryWidgetState(emitted, charging({ fullAt: NOW + 60 * MINUTE + drift }))
        );

        expect(steps).toEqual([false, false, true]);
      });
    });
  });
});
