/**
 * Vehicle Lock, Charging Cable and Climate Flow Trigger Tests
 *
 * Tests for the device triggers that fire when the car is locked/unlocked, the charging flap is
 * locked/unlocked, a charging cable is plugged in/unplugged, and the climate preconditioning
 * starts, stops or changes, and for the conditions backed by the same state.
 *
 * Triggers fire only for a real transition between two KNOWN states, never from or to UNKNOWN
 * and never for the first status.
 */

// Mock geolocation-utils
jest.mock('geolocation-utils', () => ({
  distanceTo: jest.fn().mockReturnValue(150),
}));

// Mock semver
jest.mock('semver');

import { Vehicle } from '../../drivers/Vehicle';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { Capabilities } from '../../utils/Capabilities';
import { Flows } from '../../utils/Flows';
import { UNKNOWN_FLOW_STATES } from '../../utils/FlowStates';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

const STATE_CARD_IDS = [
  Flows.CAR_LOCKED,
  Flows.CAR_UNLOCKED,
  Flows.CHARGING_FLAP_LOCKED,
  Flows.CHARGING_FLAP_UNLOCKED,
  Flows.CHARGING_CABLE_CONNECTED,
  Flows.CHARGING_CABLE_DISCONNECTED,
  Flows.CLIMATE_NOW_STARTED,
  Flows.CLIMATE_NOW_STOPPED,
  Flows.CLIMATE_STATUS_CHANGED,
];

/** Build a status; every watched state is UNKNOWN unless overridden */
const status = (overrides: Partial<VehicleStatus> = {}): VehicleStatus => ({
  vin: 'WBY12345678901234',
  driveTrain: DriveTrainType.ELECTRIC,
  lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
  ...UNKNOWN_FLOW_STATES,
  ...overrides,
});

describe('Vehicle lock, charging cable and climate flow triggers', () => {
  let vehicle: Vehicle;
  let mockLogger: any;
  let cards: Map<string, { trigger: jest.Mock }>;
  let setCapabilityValueSafeSpy: jest.SpyInstance;

  /** Ids of the lock/cable/climate cards fired so far, in the order they fired */
  const firedCards = () =>
    STATE_CARD_IDS.flatMap((id) =>
      (cards.get(id)?.trigger.mock.invocationCallOrder ?? []).map((order) => ({ id, order }))
    )
      .sort((a, b) => a.order - b.order)
      .map(({ id }) => id);

  const update = (next: VehicleStatus) => (vehicle as any).updateCapabilitiesFromStatus(next);

  /**
   * Receive a status first, so the next one has something to be compared with. The first status
   * since the app started is only a baseline: it never fires anything.
   */
  const givenPreviousStatus = async (previous: VehicleStatus) => {
    await update(previous);
    expect(firedCards()).toEqual([]);
    cards.forEach((card) => card.trigger.mockClear());
  };

  beforeEach(() => {
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockLogger = result.mocks.mockLogger;

    cards = new Map();
    for (const id of [...STATE_CARD_IDS, Flows.CHARGING_STATUS_CHANGE]) {
      cards.set(id, { trigger: jest.fn().mockResolvedValue(undefined) });
    }

    vehicle.homey = {
      app: result.mocks.mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((id: string) => cards.get(id) ?? { trigger: jest.fn() }),
      },
      settings: { get: jest.fn().mockReturnValue(null) },
    } as any;

    vehicle['stateManager'] = {
      getLastLocation: jest.fn().mockReturnValue(null),
      setLastLocation: jest.fn().mockResolvedValue(undefined),
      getLastFlowTriggeredLocation: jest.fn().mockReturnValue(null),
      setLastFlowTriggeredLocation: jest.fn().mockResolvedValue(undefined),
      getIsDriving: jest.fn().mockReturnValue(false),
    } as any;

    setCapabilityValueSafeSpy = jest
      .spyOn(vehicle as any, 'setCapabilityValueSafe')
      .mockResolvedValue(true);
    jest.spyOn(vehicle as any, 'shouldTriggerLocationFlows').mockReturnValue(false);
    jest.spyOn(vehicle as any, 'triggerLocationFlows').mockResolvedValue(undefined);
    jest.spyOn(vehicle as any, 'checkGeofence').mockResolvedValue(undefined);

    vehicle.currentVehicleState = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('transitions', () => {
    it.each([
      [Flows.CAR_LOCKED, { carLock: 'UNLOCKED' }, { carLock: 'LOCKED' }],
      [Flows.CAR_UNLOCKED, { carLock: 'LOCKED' }, { carLock: 'UNLOCKED' }],
      [Flows.CHARGING_FLAP_LOCKED, { chargingFlap: 'UNLOCKED' }, { chargingFlap: 'LOCKED' }],
      [Flows.CHARGING_FLAP_UNLOCKED, { chargingFlap: 'LOCKED' }, { chargingFlap: 'UNLOCKED' }],
      [
        Flows.CHARGING_CABLE_CONNECTED,
        { chargingCable: 'DISCONNECTED' },
        { chargingCable: 'CONNECTED' },
      ],
      [
        Flows.CHARGING_CABLE_DISCONNECTED,
        { chargingCable: 'CONNECTED' },
        { chargingCable: 'DISCONNECTED' },
      ],
    ] as const)(
      'should_fire_%s_exactlyOnce_when_theStateChanges',
      async (cardId, before, after) => {
        await givenPreviousStatus(status(before));

        await update(status(after));

        expect(firedCards()).toEqual([cardId]);
        expect(cards.get(cardId)?.trigger).toHaveBeenCalledWith(vehicle, {}, {});
      }
    );

    it('should_fireOnlyOnce_when_theSameNewStatusIsAppliedAgain', async () => {
      await givenPreviousStatus(status({ carLock: 'UNLOCKED', chargingCable: 'DISCONNECTED' }));
      const locked = status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' });

      await update(locked);
      await update({ ...locked, lastUpdatedAt: new Date('2026-11-04T10:05:00Z') });
      await update({ ...locked, lastUpdatedAt: new Date('2026-11-04T10:10:00Z') });

      expect(firedCards()).toEqual([Flows.CAR_LOCKED, Flows.CHARGING_CABLE_CONNECTED]);
    });

    it('should_fireOnEveryTransition_when_theStateFlipsBackAndForth', async () => {
      await givenPreviousStatus(status({ carLock: 'LOCKED' }));

      await update(status({ carLock: 'UNLOCKED' }));
      await update(status({ carLock: 'LOCKED' }));
      await update(status({ carLock: 'UNLOCKED' }));

      expect(firedCards()).toEqual([Flows.CAR_UNLOCKED, Flows.CAR_LOCKED, Flows.CAR_UNLOCKED]);
    });

    it('should_fireOnlyOnce_when_twoUpdatesOverlapAndCarryTheSameNewState', async () => {
      // The first update is still busy (waiting on a capability write) when the second starts, so
      // currentVehicleState has not been replaced yet; the transition must not be announced twice
      await givenPreviousStatus(status({ carLock: 'UNLOCKED' }));
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));
      const locked = status({ carLock: 'LOCKED', currentMileage: 1000 });

      const first = update(locked);
      const second = update({ ...locked, lastUpdatedAt: new Date('2026-11-04T10:00:01Z') });
      release();
      await Promise.all([first, second]);

      expect(firedCards()).toEqual([Flows.CAR_LOCKED]);
    });

    it('should_notFireTwice_when_aSettingsUpdateRunsWhileAnMqttUpdateIsBusy', async () => {
      // onSettings re-applies the cached status, which can already hold the newest state
      await givenPreviousStatus(status({ chargingCable: 'DISCONNECTED' }));
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));
      const connected = status({ chargingCable: 'CONNECTED', currentMileage: 1000 });

      const fromMqtt = update(connected);
      const fromSettings = (vehicle as any).updateCapabilitiesFromStatus(connected, {
        distanceUnit: 'imperial',
      });
      release();
      await Promise.all([fromMqtt, fromSettings]);

      expect(firedCards()).toEqual([Flows.CHARGING_CABLE_CONNECTED]);
    });

    it('should_fireAllChangedStates_when_severalStatesChangeAtOnce', async () => {
      await givenPreviousStatus(
        status({
          carLock: 'UNLOCKED',
          chargingFlap: 'UNLOCKED',
          chargingCable: 'DISCONNECTED',
        })
      );

      await update(
        status({ carLock: 'LOCKED', chargingFlap: 'LOCKED', chargingCable: 'CONNECTED' })
      );

      expect(firedCards()).toEqual([
        Flows.CAR_LOCKED,
        Flows.CHARGING_FLAP_LOCKED,
        Flows.CHARGING_CABLE_CONNECTED,
      ]);
    });

    it('should_notFireAnything_when_nothingChanges', async () => {
      const same = {
        carLock: 'LOCKED',
        chargingFlap: 'LOCKED',
        chargingCable: 'CONNECTED',
        climateActivity: 'INACTIVE',
      } as const;
      await givenPreviousStatus(status(same));

      await update(status(same));

      expect(firedCards()).toEqual([]);
    });

    it('should_notFireTheOtherTriggers_when_onlyTheCableChanges', async () => {
      await givenPreviousStatus(
        status({
          carLock: 'LOCKED',
          chargingFlap: 'LOCKED',
          chargingCable: 'DISCONNECTED',
        })
      );

      await update(
        status({ carLock: 'LOCKED', chargingFlap: 'LOCKED', chargingCable: 'CONNECTED' })
      );

      expect(firedCards()).toEqual([Flows.CHARGING_CABLE_CONNECTED]);
    });
  });

  describe('when a state is not known', () => {
    it('should_notFireAnything_when_thereIsNoPreviousStatus', async () => {
      vehicle.currentVehicleState = null;

      await update(
        status({
          carLock: 'LOCKED',
          chargingFlap: 'LOCKED',
          chargingCable: 'CONNECTED',
          climateActivity: 'HEATING',
        })
      );

      expect(firedCards()).toEqual([]);
    });

    it('should_fireOnTheSecondStatus_when_theFirstOneHadKnownStates', async () => {
      vehicle.currentVehicleState = null;
      await update(status({ carLock: 'LOCKED' }));

      await update(status({ carLock: 'UNLOCKED' }));

      expect(firedCards()).toEqual([Flows.CAR_UNLOCKED]);
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
    ] as const)('should_notFireAnything_when_%s_goesBetweenUNKNOWNAnd_%s', async (field, known) => {
      await givenPreviousStatus(status({ [field]: 'UNKNOWN' }));
      await update(status({ [field]: known }));
      expect(firedCards()).toEqual([]);

      await update(status({ [field]: 'UNKNOWN' }));
      expect(firedCards()).toEqual([]);
    });

    it('should_stillFireTheKnownTransitions_when_anotherStateIsUnknown', async () => {
      await givenPreviousStatus(status({ carLock: 'UNKNOWN', chargingCable: 'DISCONNECTED' }));

      await update(status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' }));

      expect(firedCards()).toEqual([Flows.CHARGING_CABLE_CONNECTED]);
    });

    it('should_notFireAnything_when_theNewStatusLacksTheFieldsOfAnOlderPersistedCache', async () => {
      await givenPreviousStatus(status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' }));
      const olderShape = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2026-11-04T10:05:00Z'),
      } as unknown as VehicleStatus;

      await expect(update(olderShape)).resolves.toBeUndefined();

      expect(firedCards()).toEqual([]);
      expect(vehicle.getCarLockStatus()).toBe('UNKNOWN');
      expect(vehicle.getChargingCableStatus()).toBe('UNKNOWN');
    });

    it('should_notFireAnything_when_thePreviousStatusLacksTheFieldsOfAnOlderPersistedCache', async () => {
      await givenPreviousStatus({
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
      } as unknown as VehicleStatus);

      await update(status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' }));

      expect(firedCards()).toEqual([]);
      expect(vehicle.getCarLockStatus()).toBe('LOCKED');
    });

    it('should_notFireAnything_when_theFirstStatusDiffersFromTheStatusRestoredFromTheCache', async () => {
      // currentVehicleState is restored from the cache when the device starts and can be hours
      // old: it is not a previous status to compare the first message with
      vehicle.currentVehicleState = status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' });

      await update(status({ carLock: 'UNLOCKED', chargingCable: 'DISCONNECTED' }));

      expect(firedCards()).toEqual([]);
      // The conditions already follow the new status
      expect(vehicle.getCarLockStatus()).toBe('UNLOCKED');
      expect(vehicle.getChargingCableStatus()).toBe('DISCONNECTED');

      // From here on changes are announced
      await update(status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' }));

      expect(firedCards()).toEqual([Flows.CAR_LOCKED, Flows.CHARGING_CABLE_CONNECTED]);
    });

    it('should_keepTheLastKnownState_when_aLaterStatusCarriesTheSameValue', async () => {
      // The telemetry cache keeps the newest value per key, so a message without the key still
      // yields the last known state: the status looks the same and nothing fires
      await givenPreviousStatus(status({ carLock: 'LOCKED' }));

      await update(status({ carLock: 'LOCKED', currentMileage: 12345 }));

      expect(firedCards()).toEqual([]);
      expect(vehicle.getCarLockStatus()).toBe('LOCKED');
    });
  });

  describe('climate', () => {
    it.each(['HEATING', 'COOLING', 'VENTILATION'] as const)(
      'should_fireStartedAndStatusChanged_when_climateGoesFromInactiveTo_%s',
      async (active) => {
        await givenPreviousStatus(status({ climateActivity: 'INACTIVE' }));

        await update(status({ climateActivity: active }));

        expect(firedCards()).toEqual([Flows.CLIMATE_NOW_STARTED, Flows.CLIMATE_STATUS_CHANGED]);
        expect(cards.get(Flows.CLIMATE_NOW_STARTED)?.trigger).toHaveBeenCalledWith(vehicle, {}, {});
        expect(cards.get(Flows.CLIMATE_STATUS_CHANGED)?.trigger).toHaveBeenCalledWith(
          vehicle,
          { state: { HEATING: 'Heating', COOLING: 'Cooling', VENTILATION: 'Ventilation' }[active] },
          {}
        );
      }
    );

    it.each(['HEATING', 'COOLING', 'VENTILATION'] as const)(
      'should_fireStoppedAndStatusChanged_when_climateGoesFrom_%s_toInactive',
      async (active) => {
        await givenPreviousStatus(status({ climateActivity: active }));

        await update(status({ climateActivity: 'INACTIVE' }));

        expect(firedCards()).toEqual([Flows.CLIMATE_NOW_STOPPED, Flows.CLIMATE_STATUS_CHANGED]);
        expect(cards.get(Flows.CLIMATE_STATUS_CHANGED)?.trigger).toHaveBeenCalledWith(
          vehicle,
          { state: 'Inactive' },
          {}
        );
      }
    );

    it('should_fireOnlyStatusChanged_when_climateGoesFromHeatingToVentilation', async () => {
      await givenPreviousStatus(status({ climateActivity: 'HEATING' }));

      await update(status({ climateActivity: 'VENTILATION' }));

      expect(firedCards()).toEqual([Flows.CLIMATE_STATUS_CHANGED]);
      expect(cards.get(Flows.CLIMATE_STATUS_CHANGED)?.trigger).toHaveBeenCalledWith(
        vehicle,
        { state: 'Ventilation' },
        {}
      );
    });

    it('should_fireOnce_when_theSameClimateStatusIsAppliedAgain', async () => {
      await givenPreviousStatus(status({ climateActivity: 'INACTIVE' }));

      await update(status({ climateActivity: 'HEATING' }));
      await update(status({ climateActivity: 'HEATING', currentMileage: 1 }));

      expect(firedCards()).toEqual([Flows.CLIMATE_NOW_STARTED, Flows.CLIMATE_STATUS_CHANGED]);
    });

    it('should_stillFireStatusChanged_when_theStartedTriggerFails', async () => {
      await givenPreviousStatus(status({ climateActivity: 'INACTIVE' }));
      cards.get(Flows.CLIMATE_NOW_STARTED)?.trigger.mockRejectedValue(new Error('no such flow'));

      await update(status({ climateActivity: 'COOLING' }));

      expect(cards.get(Flows.CLIMATE_STATUS_CHANGED)?.trigger).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(Flows.CLIMATE_NOW_STARTED),
        expect.any(Error)
      );
    });

    it('should_keepSettingTheClimateStatusCapability_when_climateActivityIsUnknown', async () => {
      await givenPreviousStatus(status({ climateActivity: 'HEATING' }));

      await update(status({ climateActivity: 'UNKNOWN', climate: { activity: 'INACTIVE' } }));

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.CLIMATE_STATUS,
        'INACTIVE'
      );
      expect(firedCards()).toEqual([]);
    });
  });

  describe('when a trigger fails', () => {
    it('should_logAndKeepGoing_when_aTriggerRejects', async () => {
      await givenPreviousStatus(status({ carLock: 'UNLOCKED', chargingCable: 'DISCONNECTED' }));
      cards.get(Flows.CAR_LOCKED)?.trigger.mockRejectedValue(new Error('flow engine down'));

      await expect(
        update(status({ carLock: 'LOCKED', chargingCable: 'CONNECTED', currentMileage: 500 }))
      ).resolves.toBeUndefined();

      // The other trigger still fired, the status was applied, and the failure was logged
      expect(cards.get(Flows.CHARGING_CABLE_CONNECTED)?.trigger).toHaveBeenCalledTimes(1);
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MILEAGE, 500);
      expect(vehicle.currentVehicleState?.carLock).toBe('LOCKED');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(Flows.CAR_LOCKED),
        expect.objectContaining({ message: 'flow engine down' })
      );
    });

    it('should_notRetryTheFailedTrigger_when_theNextUpdateCarriesTheSameState', async () => {
      await givenPreviousStatus(status({ carLock: 'UNLOCKED' }));
      cards.get(Flows.CAR_LOCKED)?.trigger.mockRejectedValueOnce(new Error('flow engine down'));

      await update(status({ carLock: 'LOCKED' }));
      await update(status({ carLock: 'LOCKED' }));

      expect(cards.get(Flows.CAR_LOCKED)?.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_logAndKeepGoing_when_theCardCannotBeFound', async () => {
      await givenPreviousStatus(status({ carLock: 'UNLOCKED', chargingFlap: 'UNLOCKED' }));
      (vehicle.homey.flow.getDeviceTriggerCard as jest.Mock).mockImplementation((id: string) => {
        if (id === Flows.CAR_LOCKED) {
          throw new Error('Invalid Flow Card ID');
        }
        return cards.get(id) ?? { trigger: jest.fn() };
      });

      await expect(
        update(status({ carLock: 'LOCKED', chargingFlap: 'LOCKED' }))
      ).resolves.toBeUndefined();

      expect(cards.get(Flows.CHARGING_FLAP_LOCKED)?.trigger).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(Flows.CAR_LOCKED),
        expect.any(Error)
      );
    });

    it('should_stillFireTheTriggers_when_anEarlierStepOfTheUpdateThrows', async () => {
      // The transition has happened whether or not the rest of the update worked
      await givenPreviousStatus(status({ carLock: 'UNLOCKED' }));
      setCapabilityValueSafeSpy.mockRejectedValue(new Error('capability write failed'));

      await expect(update(status({ carLock: 'LOCKED', currentMileage: 500 }))).rejects.toThrow(
        'capability write failed'
      );

      expect(firedCards()).toEqual([Flows.CAR_LOCKED]);
      expect(vehicle.getCarLockStatus()).toBe('LOCKED');
    });

    it('should_notBreakTheChargingStatusChangeTrigger_when_theNewTriggersAreAdded', async () => {
      await givenPreviousStatus(
        status({
          chargingCable: 'DISCONNECTED',
          electric: {
            chargeLevelPercent: 50,
            range: 200,
            isChargerConnected: false,
            chargingStatus: 'NOT_CHARGING',
          },
        })
      );

      await update(
        status({
          chargingCable: 'CONNECTED',
          electric: {
            chargeLevelPercent: 50,
            range: 200,
            isChargerConnected: true,
            chargingStatus: 'CHARGING',
          },
        })
      );

      expect(cards.get(Flows.CHARGING_STATUS_CHANGE)?.trigger).toHaveBeenCalledTimes(1);
      expect(cards.get(Flows.CHARGING_CABLE_CONNECTED)?.trigger).toHaveBeenCalledTimes(1);
    });
  });

  describe('conditions', () => {
    it('should_readUnknown_when_noStatusHasBeenSeenYet', () => {
      vehicle.currentVehicleState = null;

      expect(vehicle.getCarLockStatus()).toBe('UNKNOWN');
      expect(vehicle.getChargingCableStatus()).toBe('UNKNOWN');
    });

    it.each(['LOCKED', 'UNLOCKED', 'UNKNOWN'] as const)(
      'should_returnTheCarLock_%s_fromTheCurrentStatus',
      (carLock) => {
        vehicle.currentVehicleState = status({ carLock });

        expect(vehicle.getCarLockStatus()).toBe(carLock);
      }
    );

    it.each(['CONNECTED', 'DISCONNECTED', 'UNKNOWN'] as const)(
      'should_returnTheChargingCable_%s_fromTheCurrentStatus',
      (chargingCable) => {
        vehicle.currentVehicleState = status({ chargingCable });

        expect(vehicle.getChargingCableStatus()).toBe(chargingCable);
      }
    );

    it('should_readUnknown_when_theCurrentStatusComesFromAnOlderPersistedCache', () => {
      vehicle.currentVehicleState = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date(),
      } as unknown as VehicleStatus;

      expect(vehicle.getCarLockStatus()).toBe('UNKNOWN');
      expect(vehicle.getChargingCableStatus()).toBe('UNKNOWN');
    });

    it('should_followTheLatestStatus_when_updatesArrive', async () => {
      await givenPreviousStatus(status({ carLock: 'LOCKED', chargingCable: 'CONNECTED' }));

      await update(status({ carLock: 'UNLOCKED', chargingCable: 'DISCONNECTED' }));

      expect(vehicle.getCarLockStatus()).toBe('UNLOCKED');
      expect(vehicle.getChargingCableStatus()).toBe('DISCONNECTED');
    });

    it('should_alreadyAnswerWithTheNewState_when_aTriggerFlowAsksTheCondition', async () => {
      // A flow started by "The car was unlocked" that checks "The car is locked" must see the
      // new state, so the condition has to be up to date by the time the trigger fires
      await givenPreviousStatus(status({ carLock: 'LOCKED' }));
      let seenByFlow: string | undefined;
      cards.get(Flows.CAR_UNLOCKED)?.trigger.mockImplementation(() => {
        seenByFlow = vehicle.getCarLockStatus();
        return Promise.resolve();
      });

      await update(status({ carLock: 'UNLOCKED' }));

      expect(seenByFlow).toBe('UNLOCKED');
    });
  });
});
