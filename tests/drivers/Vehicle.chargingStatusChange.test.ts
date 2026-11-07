/**
 * Vehicle Charging Status Change Flow Tests
 *
 * Tests for the charging_status_change trigger. It follows the same rules as the lock, charging
 * cable and climate triggers: it fires for a real change between two KNOWN charging statuses, never
 * for the first status since the app started, never from or to UNKNOWN, and never twice for the
 * same change.
 */

// Mock geolocation-utils
jest.mock('geolocation-utils', () => ({
  distanceTo: jest.fn().mockReturnValue(150),
}));

// Mock semver
jest.mock('semver');

import { Vehicle } from '../../drivers/Vehicle';
import type { ChargingStatus, VehicleStatus } from '../../lib/models/VehicleStatus';
import { Capabilities } from '../../utils/Capabilities';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

/** Build a status with a charging status; the cable is plugged in unless overridden */
const status = (
  chargingStatus: ChargingStatus | undefined,
  overrides: Partial<VehicleStatus> = {},
  chargeLevelPercent = 50
): VehicleStatus => ({
  vin: 'WBY12345678901234',
  driveTrain: DriveTrainType.ELECTRIC,
  lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
  carLock: 'UNKNOWN',
  chargingFlap: 'UNKNOWN',
  chargingCable: 'CONNECTED',
  climateActivity: 'UNKNOWN',
  electric: {
    chargeLevelPercent,
    range: 200,
    isChargerConnected: true,
    chargingStatus: chargingStatus as ChargingStatus,
  },
  ...overrides,
});

describe('Vehicle charging status change flow', () => {
  let vehicle: Vehicle;
  let mockLogger: any;
  let chargingStatusChangeCard: { trigger: jest.Mock };
  let otherCard: { trigger: jest.Mock };
  let setCapabilityValueSafeSpy: jest.SpyInstance;

  const update = (next: VehicleStatus) => (vehicle as any).updateCapabilitiesFromStatus(next);

  /**
   * Receive a status first, so the next one has something to be compared with. The first status
   * since the app started is only a baseline: it never fires anything.
   */
  const givenPreviousStatus = async (previous: VehicleStatus) => {
    await update(previous);
    expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    chargingStatusChangeCard.trigger.mockClear();
    setCapabilityValueSafeSpy.mockClear();
  };

  beforeEach(() => {
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    mockLogger = result.mocks.mockLogger;

    chargingStatusChangeCard = { trigger: jest.fn().mockResolvedValue(undefined) };
    otherCard = { trigger: jest.fn().mockResolvedValue(undefined) };

    vehicle.homey = {
      app: result.mocks.mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardId: string) =>
          cardId === 'charging_status_change' ? chargingStatusChangeCard : otherCard
        ),
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

    vehicle.currentVehicleState = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('changes between two known statuses', () => {
    it.each([
      ['NOT_CHARGING', 'CHARGING'],
      ['CHARGING', 'NOT_CHARGING'],
      ['CHARGING', 'COMPLETE'],
      ['COMPLETE', 'NOT_CHARGING'],
      ['CHARGING', 'PAUSED'],
      ['PAUSED', 'CHARGING'],
      ['NOT_CHARGING', 'INITIALIZING'],
      ['INITIALIZING', 'CHARGING'],
      ['CHARGING', 'ERROR'],
      ['ERROR', 'NOT_CHARGING'],
    ] as const)('should_fireOnceWithTheNewStatus_when_goingFrom_%s_to_%s', async (from, to) => {
      await givenPreviousStatus(status(from));

      await update(status(to));

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: to },
        {}
      );
    });

    it('should_passTheInternalStatusAndNotTheHomeyStateOrTheRawBmwValue_asTheToken', async () => {
      await givenPreviousStatus(status('CHARGING'));

      await update(status('COMPLETE'));

      const tokens = chargingStatusChangeCard.trigger.mock.calls[0][1];
      expect(tokens).toEqual({ charging_status: 'COMPLETE' });
      expect(tokens.charging_status).not.toBe('plugged_in');
      expect(tokens.charging_status).not.toBe('CHARGINGENDED');
    });

    it('should_notFire_when_theStatusIsTheSameAndOnlyTheBatteryLevelChanges', async () => {
      await givenPreviousStatus(status('CHARGING', {}, 50));

      await update(status('CHARGING', {}, 55));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
      // The capability is still written
      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in_charging'
      );
    });

    it('should_fireOnEveryChange_when_theStatusChangesSeveralTimes', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));

      await update(status('CHARGING'));
      await update(status('COMPLETE'));
      await update(status('NOT_CHARGING'));

      expect(chargingStatusChangeCard.trigger.mock.calls.map((call) => call[1])).toEqual([
        { charging_status: 'CHARGING' },
        { charging_status: 'COMPLETE' },
        { charging_status: 'NOT_CHARGING' },
      ]);
    });

    it('should_notFire_when_onlyTheCableChanges', async () => {
      await givenPreviousStatus(status('NOT_CHARGING', { chargingCable: 'DISCONNECTED' }));

      await update(status('NOT_CHARGING', { chargingCable: 'CONNECTED' }));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });

    it('should_fireOnTheSecondStatus_when_theFirstOneHadAKnownStatus', async () => {
      await update(status('NOT_CHARGING'));

      await update(status('CHARGING'));

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });
  });

  describe('when the status is not known or there is nothing to compare with', () => {
    it.each(['NOT_CHARGING', 'CHARGING', 'COMPLETE', 'PAUSED', 'INITIALIZING', 'ERROR'] as const)(
      'should_notFire_when_itIsTheFirstStatusSinceStartupAndItIs_%s',
      async (first) => {
        vehicle.currentVehicleState = null;

        await update(status(first));

        expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
      }
    );

    it('should_notFire_when_theFirstStatusDiffersFromTheStatusRestoredFromTheCache', async () => {
      // currentVehicleState is restored from the cache at startup and can be hours old: it is not
      // a previous status to compare the first message with
      vehicle.currentVehicleState = status('NOT_CHARGING');

      await update(status('CHARGING'));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();

      // From here on changes are announced
      await update(status('COMPLETE'));

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledWith(
        vehicle,
        { charging_status: 'COMPLETE' },
        {}
      );
    });

    it('should_notFire_when_thePreviousStatusIsUnknownAndTheNewOneIsKnown', async () => {
      await givenPreviousStatus(status('UNKNOWN'));

      await update(status('CHARGING'));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });

    it('should_notFire_when_thePreviousStatusIsKnownAndTheNewOneIsUnknown', async () => {
      await givenPreviousStatus(status('CHARGING'));

      await update(status('UNKNOWN'));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });

    it('should_notFire_when_theNewStatusHasNoChargingStatus', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));

      await update(status(undefined));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });

    it('should_notFire_when_theNewStatusHasAnInvalidChargingStatus', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));

      await update(status('INVALID'));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });

    it('should_notFire_when_theElectricDataIsMissing', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));

      await update(status('NOT_CHARGING', { electric: undefined }));

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        expect.anything()
      );
    });

    it('should_notFireOnTheWayBackFromUnknown_butFireOnTheNextRealChange', async () => {
      await givenPreviousStatus(status('CHARGING'));
      await update(status('UNKNOWN'));
      await update(status('CHARGING'));
      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();

      await update(status('COMPLETE'));

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_notFire_when_theStatusIsAnOlderPersistedStatusWithoutTheElectricFields', async () => {
      await givenPreviousStatus(status('CHARGING'));
      const olderShape = {
        vin: 'WBY12345678901234',
        driveTrain: DriveTrainType.ELECTRIC,
        lastUpdatedAt: new Date('2026-11-04T10:05:00Z'),
      } as unknown as VehicleStatus;

      await expect(update(olderShape)).resolves.toBeUndefined();

      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });
  });

  describe('never firing twice', () => {
    it('should_fireExactlyOnce_when_oneUpdateChangesTheStatus', async () => {
      // The status used to be announced from two places
      await givenPreviousStatus(status('NOT_CHARGING'));

      await update(status('CHARGING'));

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_fireOnlyOnce_when_theSameNewStatusIsAppliedAgain', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));
      const charging = status('CHARGING');

      await update(charging);
      await update({ ...charging, lastUpdatedAt: new Date('2026-11-04T10:05:00Z') });
      await update({ ...charging, lastUpdatedAt: new Date('2026-11-04T10:10:00Z') });

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_fireOnlyOnce_when_twoUpdatesOverlapAndCarryTheSameNewStatus', async () => {
      // The first update is still busy (waiting on a capability write) when the second starts, so
      // currentVehicleState has not been replaced yet
      await givenPreviousStatus(status('NOT_CHARGING'));
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));
      const charging = status('CHARGING', { currentMileage: 1000 });

      const first = update(charging);
      const second = update({ ...charging, lastUpdatedAt: new Date('2026-11-04T10:00:01Z') });
      release();
      await Promise.all([first, second]);

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_notFireTwice_when_aSettingsUpdateRunsWhileAnMqttUpdateIsBusy', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));
      const charging = status('CHARGING', { currentMileage: 1000 });

      const fromMqtt = update(charging);
      const fromSettings = (vehicle as any).updateCapabilitiesFromStatus(charging, {
        distanceUnit: 'imperial',
      });
      release();
      await Promise.all([fromMqtt, fromSettings]);

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });
  });

  describe('together with the EV charging state capability', () => {
    it('should_writeTheCapabilityBeforeTheTriggerFires', async () => {
      // A flow started by the trigger that reads the capability sees the new state
      await givenPreviousStatus(status('NOT_CHARGING'));

      await update(status('CHARGING'));

      const capabilityWrite = setCapabilityValueSafeSpy.mock.calls.findIndex(
        ([name]) => name === Capabilities.EV_CHARGING_STATE
      );
      expect(capabilityWrite).toBeGreaterThanOrEqual(0);
      expect(setCapabilityValueSafeSpy.mock.invocationCallOrder[capabilityWrite]).toBeLessThan(
        chargingStatusChangeCard.trigger.mock.invocationCallOrder[0]
      );
    });

    it('should_stillFire_when_anEarlierStepOfTheUpdateThrows', async () => {
      // The change has happened whether or not the rest of the update worked
      await givenPreviousStatus(status('NOT_CHARGING'));
      setCapabilityValueSafeSpy.mockRejectedValue(new Error('capability write failed'));

      await expect(update(status('CHARGING', { currentMileage: 500 }))).rejects.toThrow(
        'capability write failed'
      );

      expect(chargingStatusChangeCard.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_logAndKeepGoing_when_theTriggerRejects', async () => {
      await givenPreviousStatus(status('NOT_CHARGING'));
      chargingStatusChangeCard.trigger.mockRejectedValue(new Error('flow engine down'));

      await expect(update(status('CHARGING'))).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('charging_status_change'),
        expect.objectContaining({ message: 'flow engine down' })
      );
    });

    it('should_showPluggedIn_when_theCarIsPluggedInAndWaitingForAScheduledStart', async () => {
      // NOCHARGING with a connected cable used to show as plugged out
      await update(status('NOT_CHARGING', { chargingCable: 'CONNECTED' }));

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        'plugged_in'
      );
    });

    it('should_leaveTheCapabilityAsItIs_when_theCableIsUnknownAndTheCarIsNotCharging', async () => {
      await update(status('NOT_CHARGING', { chargingCable: 'UNKNOWN' }));

      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        expect.anything()
      );
    });

    it('should_notTouchTheCapabilityOrTheTrigger_when_theElectricDataIsMissingOnTheFirstStatus', async () => {
      await update(status('CHARGING', { electric: undefined }));

      expect(setCapabilityValueSafeSpy).not.toHaveBeenCalledWith(
        Capabilities.EV_CHARGING_STATE,
        expect.anything()
      );
      expect(chargingStatusChangeCard.trigger).not.toHaveBeenCalled();
    });
  });
});
