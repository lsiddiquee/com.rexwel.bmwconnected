/**
 * Tests for the states the lock, charging cable and climate flow triggers watch, and for the
 * rules that decide which triggers a change of those states fires.
 */

import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import {
  FlowStates,
  planStateTriggers,
  readFlowStates,
  UNKNOWN_FLOW_STATES,
} from '../../utils/FlowStates';
import { Flows } from '../../utils/Flows';

const states = (overrides: Partial<FlowStates> = {}): FlowStates => ({
  ...UNKNOWN_FLOW_STATES,
  ...overrides,
});

const cardIds = (previous: FlowStates | undefined, next: FlowStates) =>
  planStateTriggers(previous, next).map((trigger) => trigger.cardId);

describe('FlowStates', () => {
  describe('readFlowStates', () => {
    it('should_readTheStates_when_statusHasThem', () => {
      const result = readFlowStates({
        carLock: 'LOCKED',
        chargingFlap: 'UNLOCKED',
        chargingCable: 'CONNECTED',
        climateActivity: 'HEATING',
        electric: { chargingStatus: 'PAUSED', chargeLevelPercent: 85 },
        vin: 'ignored',
      } as any);

      expect(result).toEqual({
        carLock: 'LOCKED',
        chargingFlap: 'UNLOCKED',
        chargingCable: 'CONNECTED',
        climateActivity: 'HEATING',
        chargingStatus: 'PAUSED',
        batteryLevel: 85,
      });
    });

    it.each([
      'CHARGING',
      'NOT_CHARGING',
      'COMPLETE',
      'PAUSED',
      'INITIALIZING',
      'ERROR',
      'UNKNOWN',
    ] as const)('should_readTheChargingStatus_%s_fromTheElectricState', (chargingStatus) => {
      const result = readFlowStates({ electric: { chargingStatus } });

      expect(result.chargingStatus).toBe(chargingStatus);
    });

    it.each([
      ['a status of another type', 'LOCKED'],
      ['the legacy INVALID status', 'INVALID'],
      ['a raw BMW value', 'CHARGINGACTIVE'],
      ['a number', 3],
      ['undefined', undefined],
      ['null', null],
    ])('should_readUnknownChargingStatus_when_theValueIs_%s', (_name, chargingStatus) => {
      expect(readFlowStates({ electric: { chargingStatus } }).chargingStatus).toBe('UNKNOWN');
    });

    it('should_readUnknownChargingStatus_when_thereIsNoElectricState', () => {
      expect(readFlowStates({ electric: undefined }).chargingStatus).toBe('UNKNOWN');
      expect(readFlowStates({ electric: null }).chargingStatus).toBe('UNKNOWN');
      expect(readFlowStates({}).chargingStatus).toBe('UNKNOWN');
    });

    it.each([0, 1, 49.5, 100])('should_readTheBatteryLevel_%s_fromTheElectricState', (level) => {
      expect(readFlowStates({ electric: { chargeLevelPercent: level } }).batteryLevel).toBe(level);
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a numeric string', '85'],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('should_readNoBatteryLevel_when_theValueIs_%s', (_name, chargeLevelPercent) => {
      expect(readFlowStates({ electric: { chargeLevelPercent } }).batteryLevel).toBeUndefined();
    });

    it('should_readNoBatteryLevel_when_thereIsNoElectricState', () => {
      expect(readFlowStates({ electric: undefined }).batteryLevel).toBeUndefined();
      expect(readFlowStates(undefined).batteryLevel).toBeUndefined();
    });

    it.each([null, undefined])('should_readUnknown_when_statusIs_%p', (status) => {
      expect(readFlowStates(status)).toEqual(UNKNOWN_FLOW_STATES);
    });

    it('should_readUnknown_when_statusComesFromAnOlderPersistedCacheWithoutTheFields', () => {
      // Typed as a full status, as it would be when restored and cast
      const olderStatus = {
        vin: 'VIN',
        driveTrain: 'ELECTRIC',
        lastUpdatedAt: new Date(),
      } as unknown as VehicleStatus;

      expect(readFlowStates(olderStatus)).toEqual(UNKNOWN_FLOW_STATES);
    });

    it('should_readUnknownPerField_when_aFieldIsMissingOrNotAValidState', () => {
      const result = readFlowStates({
        carLock: 'LOCKED',
        chargingFlap: 'SECURED', // a state of another type
        chargingCable: 7,
        climateActivity: undefined,
        electric: { chargingStatus: 'bogus', chargeLevelPercent: 'high' },
      });

      expect(result).toEqual(states({ carLock: 'LOCKED' }));
    });

    it('should_haveAnUnknownChargingStatusAndNoBatteryLevel_when_nothingIsKnown', () => {
      expect(UNKNOWN_FLOW_STATES.chargingStatus).toBe('UNKNOWN');
      expect(UNKNOWN_FLOW_STATES.batteryLevel).toBeUndefined();
      expect('batteryLevel' in UNKNOWN_FLOW_STATES).toBe(true);
    });

    it('should_returnAFreshObject_when_nothingIsKnown', () => {
      const first = readFlowStates(undefined);
      first.carLock = 'LOCKED';

      expect(readFlowStates(undefined).carLock).toBe('UNKNOWN');
      expect(UNKNOWN_FLOW_STATES.carLock).toBe('UNKNOWN');
    });
  });

  describe('planStateTriggers', () => {
    it.each([
      ['car_locked', 'carLock', 'UNLOCKED', 'LOCKED', Flows.CAR_LOCKED],
      ['car_unlocked', 'carLock', 'LOCKED', 'UNLOCKED', Flows.CAR_UNLOCKED],
      ['charging_flap_locked', 'chargingFlap', 'UNLOCKED', 'LOCKED', Flows.CHARGING_FLAP_LOCKED],
      [
        'charging_flap_unlocked',
        'chargingFlap',
        'LOCKED',
        'UNLOCKED',
        Flows.CHARGING_FLAP_UNLOCKED,
      ],
      [
        'charging_cable_connected',
        'chargingCable',
        'DISCONNECTED',
        'CONNECTED',
        Flows.CHARGING_CABLE_CONNECTED,
      ],
      [
        'charging_cable_disconnected',
        'chargingCable',
        'CONNECTED',
        'DISCONNECTED',
        Flows.CHARGING_CABLE_DISCONNECTED,
      ],
    ])('should_fire_%s_when_%s_goes_from_%s_to_%s', (_name, field, from, to, expectedCard) => {
      const planned = planStateTriggers(states({ [field]: from }), states({ [field]: to }));

      expect(planned).toEqual([{ cardId: expectedCard, tokens: {} }]);
    });

    it('should_fireNothing_when_nothingChanged', () => {
      const same = states({
        carLock: 'LOCKED',
        chargingFlap: 'UNLOCKED',
        chargingCable: 'CONNECTED',
        climateActivity: 'INACTIVE',
      });

      expect(planStateTriggers(same, { ...same })).toEqual([]);
    });

    it('should_fireNothing_when_thereIsNoPreviousStatus', () => {
      const next = states({
        carLock: 'LOCKED',
        chargingFlap: 'LOCKED',
        chargingCable: 'CONNECTED',
        climateActivity: 'HEATING',
      });

      expect(planStateTriggers(undefined, next)).toEqual([]);
    });

    it.each([
      ['carLock', 'LOCKED'],
      ['carLock', 'UNLOCKED'],
      ['chargingFlap', 'LOCKED'],
      ['chargingFlap', 'UNLOCKED'],
      ['chargingCable', 'CONNECTED'],
      ['chargingCable', 'DISCONNECTED'],
      ['climateActivity', 'HEATING'],
      ['climateActivity', 'INACTIVE'],
    ])('should_fireNothing_when_%s_goes_from_UNKNOWN_to_%s_or_back', (field, known) => {
      expect(planStateTriggers(states({ [field]: 'UNKNOWN' }), states({ [field]: known }))).toEqual(
        []
      );
      expect(planStateTriggers(states({ [field]: known }), states({ [field]: 'UNKNOWN' }))).toEqual(
        []
      );
    });

    it('should_fireEachTransitionOnce_when_severalStatesChangeAtTheSameTime', () => {
      const previous = states({
        carLock: 'UNLOCKED',
        chargingFlap: 'UNLOCKED',
        chargingCable: 'DISCONNECTED',
      });
      const next = states({
        carLock: 'LOCKED',
        chargingFlap: 'LOCKED',
        chargingCable: 'CONNECTED',
      });

      expect(cardIds(previous, next)).toEqual([
        Flows.CAR_LOCKED,
        Flows.CHARGING_FLAP_LOCKED,
        Flows.CHARGING_CABLE_CONNECTED,
      ]);
    });

    it('should_notLetOneUnknownStateBlockTheOthers_when_onlyOneStateIsUnknown', () => {
      const previous = states({ carLock: 'UNKNOWN', chargingCable: 'DISCONNECTED' });
      const next = states({ carLock: 'LOCKED', chargingCable: 'CONNECTED' });

      expect(cardIds(previous, next)).toEqual([Flows.CHARGING_CABLE_CONNECTED]);
    });

    describe('charging status', () => {
      const KNOWN = [
        'CHARGING',
        'NOT_CHARGING',
        'COMPLETE',
        'PAUSED',
        'INITIALIZING',
        'ERROR',
      ] as const;
      const pairs = KNOWN.flatMap((from) =>
        KNOWN.filter((to) => to !== from).map((to) => [from, to] as const)
      );

      it('should_haveEveryOrderedPairOfDistinctKnownStatuses', () => {
        expect(pairs).toHaveLength(30);
      });

      it.each(pairs)(
        'should_fireChargingStatusChanged_when_chargingStatusGoesFrom_%s_to_%s',
        (from, to) => {
          const planned = planStateTriggers(
            states({ chargingStatus: from }),
            states({ chargingStatus: to })
          );

          expect(planned).toEqual([
            { cardId: Flows.CHARGING_STATUS_CHANGE, tokens: { charging_status: to } },
          ]);
        }
      );

      it.each(KNOWN)('should_fireNothing_when_chargingStatusStaysAt_%s', (status) => {
        expect(
          planStateTriggers(states({ chargingStatus: status }), states({ chargingStatus: status }))
        ).toEqual([]);
      });

      it.each(KNOWN)('should_fireNothing_when_chargingStatusGoesBetweenUNKNOWNAnd_%s', (known) => {
        expect(
          planStateTriggers(
            states({ chargingStatus: 'UNKNOWN' }),
            states({ chargingStatus: known })
          )
        ).toEqual([]);
        expect(
          planStateTriggers(
            states({ chargingStatus: known }),
            states({ chargingStatus: 'UNKNOWN' })
          )
        ).toEqual([]);
      });

      it('should_fireNothing_when_chargingStatusStaysUnknown', () => {
        expect(planStateTriggers(states(), states())).toEqual([]);
      });

      it.each(KNOWN)('should_fireNothing_when_thereIsNoPreviousStatusAndItIs_%s', (status) => {
        expect(planStateTriggers(undefined, states({ chargingStatus: status }))).toEqual([]);
      });

      it('should_fireAfterTheCableCard_when_bothChange', () => {
        const planned = cardIds(
          states({ chargingCable: 'DISCONNECTED', chargingStatus: 'NOT_CHARGING' }),
          states({ chargingCable: 'CONNECTED', chargingStatus: 'CHARGING' })
        );

        expect(planned).toEqual([Flows.CHARGING_CABLE_CONNECTED, Flows.CHARGING_STATUS_CHANGE]);
      });

      it('should_useTheCardIdOfTheExistingChargingStatusCard', () => {
        expect(Flows.CHARGING_STATUS_CHANGE).toBe('charging_status_change');
      });
    });

    describe('battery level', () => {
      it.each([
        [80, 81],
        [81, 82],
        [81, 79],
        [0, 1],
        [100, 99],
        [50.5, 50.6],
      ])('should_fireBatteryLevelAbove_when_theLevelGoesFrom_%s_to_%s', (from, to) => {
        const planned = planStateTriggers(
          states({ batteryLevel: from }),
          states({ batteryLevel: to })
        );

        // The level is not filtered here: every flow compares it with its own percentage
        expect(planned).toEqual([
          {
            cardId: Flows.BATTERY_LEVEL_ABOVE,
            tokens: { battery: to },
            state: { level: to },
          },
        ]);
      });

      it.each([0, 80, 100])('should_fireNothing_when_theLevelStaysAt_%s', (level) => {
        expect(
          planStateTriggers(states({ batteryLevel: level }), states({ batteryLevel: level }))
        ).toEqual([]);
      });

      it('should_fireNothing_when_thereIsNoPreviousStatus', () => {
        expect(planStateTriggers(undefined, states({ batteryLevel: 85 }))).toEqual([]);
      });

      it.each([0, 81])('should_fireNothing_when_theLevelGoesBetweenUnknownAnd_%s', (level) => {
        expect(
          planStateTriggers(states({ batteryLevel: undefined }), states({ batteryLevel: level }))
        ).toEqual([]);
        expect(
          planStateTriggers(states({ batteryLevel: level }), states({ batteryLevel: undefined }))
        ).toEqual([]);
      });

      it('should_fireNothing_when_theLevelStaysUnknown', () => {
        expect(planStateTriggers(states(), states())).toEqual([]);
      });

      it('should_useTheCardIdOfTheBatteryLevelAboveCard', () => {
        expect(Flows.BATTERY_LEVEL_ABOVE).toBe('battery_level_above');
      });
    });

    describe('climate', () => {
      it.each([
        ['HEATING', 'Heating'],
        ['COOLING', 'Cooling'],
        ['VENTILATION', 'Ventilation'],
      ] as const)(
        'should_fireStartedAndChanged_when_climateGoesFromInactiveTo_%s',
        (active, title) => {
          const planned = planStateTriggers(
            states({ climateActivity: 'INACTIVE' }),
            states({ climateActivity: active })
          );

          expect(planned).toEqual([
            { cardId: Flows.CLIMATE_NOW_STARTED, tokens: {} },
            { cardId: Flows.CLIMATE_STATUS_CHANGED, tokens: { state: title } },
          ]);
        }
      );

      it.each(['HEATING', 'COOLING', 'VENTILATION'] as const)(
        'should_fireStoppedAndChanged_when_climateGoesFrom_%s_toInactive',
        (active) => {
          const planned = planStateTriggers(
            states({ climateActivity: active }),
            states({ climateActivity: 'INACTIVE' })
          );

          expect(planned).toEqual([
            { cardId: Flows.CLIMATE_NOW_STOPPED, tokens: {} },
            { cardId: Flows.CLIMATE_STATUS_CHANGED, tokens: { state: 'Inactive' } },
          ]);
        }
      );

      it.each([
        ['HEATING', 'VENTILATION', 'Ventilation'],
        ['COOLING', 'HEATING', 'Heating'],
        ['VENTILATION', 'COOLING', 'Cooling'],
      ] as const)('should_fireOnlyChanged_when_climateGoesFrom_%s_to_%s', (from, to, title) => {
        const planned = planStateTriggers(
          states({ climateActivity: from }),
          states({ climateActivity: to })
        );

        expect(planned).toEqual([
          { cardId: Flows.CLIMATE_STATUS_CHANGED, tokens: { state: title } },
        ]);
      });

      it.each(['INACTIVE', 'HEATING', 'COOLING', 'VENTILATION'] as const)(
        'should_fireNothing_when_climateStaysAt_%s',
        (activity) => {
          expect(
            planStateTriggers(
              states({ climateActivity: activity }),
              states({ climateActivity: activity })
            )
          ).toEqual([]);
        }
      );
    });

    it('should_useTheCardIdsOfTheExistingClimateCards', () => {
      expect(Flows.CLIMATE_NOW_STARTED).toBe('climate_now_started');
      expect(Flows.CLIMATE_NOW_STOPPED).toBe('climate_now_stopped');
      expect(Flows.CLIMATE_STATUS_CHANGED).toBe('climate_status_changed');
    });
  });
});
