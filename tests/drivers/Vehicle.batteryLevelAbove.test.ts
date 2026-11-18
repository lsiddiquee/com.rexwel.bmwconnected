/**
 * Vehicle "Battery level changed and is above ..." Flow Trigger Tests
 *
 * The trigger fires on every change of the known battery level, with the new level in the state.
 * Homey then asks the app's run listener, once per flow, whether that flow's own percentage is
 * below the new level. These tests run both halves together: a simulated Homey calls the real run
 * listener for every flow card in the "flows" list, so what is asserted is which flows would run.
 *
 * Never for the first level after startup, never when the level is unchanged, never from or to an
 * unknown level, and never twice for the same change.
 */

jest.mock('homey', () => ({
  ...jest.requireActual('../__mocks__/homey'),
  __esModule: true,
  default: { App: class {} },
  SimpleClass: class {},
}));

// Mock geolocation-utils
jest.mock('geolocation-utils', () => ({
  distanceTo: jest.fn().mockReturnValue(150),
}));

// Mock semver
jest.mock('semver');

import type { BMWConnectedDrive } from '../../app';
import { Vehicle } from '../../drivers/Vehicle';
import type { VehicleStatus } from '../../lib/models/VehicleStatus';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { Capabilities } from '../../utils/Capabilities';
import { Flows } from '../../utils/Flows';
import { createMockedVehicle } from '../helpers/vehicleTestHelper';

// app.ts ends with `module.exports = BMWConnectedDrive`, so the class is the module itself
const AppClass = jest.requireActual<typeof BMWConnectedDrive>('../../app');

/** Build a status with a battery level; `undefined` leaves the level out */
const statusWithLevel = (level: number | undefined, overrides: Partial<VehicleStatus> = {}) =>
  ({
    vin: 'WBY12345678901234',
    driveTrain: DriveTrainType.ELECTRIC,
    lastUpdatedAt: new Date('2026-11-04T10:00:00Z'),
    carLock: 'UNKNOWN',
    chargingFlap: 'UNKNOWN',
    chargingCable: 'UNKNOWN',
    climateActivity: 'UNKNOWN',
    electric: {
      chargeLevelPercent: level,
      range: 200,
      isChargerConnected: false,
      chargingStatus: 'NOT_CHARGING',
    },
    ...overrides,
  }) as VehicleStatus;

describe('Vehicle battery_level_above trigger', () => {
  let vehicle: Vehicle;
  let batteryCard: { trigger: jest.Mock };
  let setCapabilityValueSafeSpy: jest.SpyInstance;
  /** The percentage of every flow that uses the trigger card */
  let flows: number[];
  /** Which flows (by percentage) ran, with the level they ran for, in order */
  let ran: Array<{ percentage: number; level: number }>;

  const update = (next: VehicleStatus) => (vehicle as any).updateCapabilitiesFromStatus(next);
  const feed = async (...levels: Array<number | undefined>) => {
    for (const level of levels) {
      await update(statusWithLevel(level));
    }
  };
  /** The levels the flow with this percentage ran for */
  const ranFor = (percentage: number) =>
    ran.filter((entry) => entry.percentage === percentage).map((entry) => entry.level);

  beforeEach(() => {
    const result = createMockedVehicle();
    vehicle = result.vehicle;
    flows = [80];
    ran = [];

    // The real run listener, registered the way the app registers it at startup
    let runListener: (args: any, state: any) => unknown = () => false;
    const app = Object.create(AppClass.prototype) as BMWConnectedDrive;
    (app as any).homey = {
      flow: {
        getDeviceTriggerCard: jest.fn(() => ({
          registerRunListener: (listener: typeof runListener) => (runListener = listener),
        })),
      },
    };
    app['registerTriggerCards']();

    // A simulated Homey: for every trigger it calls the run listener once per flow, with that
    // flow's own arguments, and runs the flow when the listener says yes
    batteryCard = {
      trigger: jest.fn(async (device: unknown, tokens: { battery: number }, state: unknown) => {
        for (const percentage of flows) {
          if (await runListener({ device, percentage }, state)) {
            ran.push({ percentage, level: tokens.battery });
          }
        }
      }),
    };

    vehicle.homey = {
      app: result.mocks.mockApp,
      flow: {
        getDeviceTriggerCard: jest.fn((cardId: string) =>
          cardId === Flows.BATTERY_LEVEL_ABOVE ? batteryCard : { trigger: jest.fn() }
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

  describe('a flow with the percentage 80', () => {
    it('should_runForEachChangeAboveEighty_when_theLevelKeepsRising', async () => {
      await feed(80);

      await feed(81);
      expect(ranFor(80)).toEqual([81]);

      await feed(82);
      expect(ranFor(80)).toEqual([81, 82]);

      await feed(83);
      expect(ranFor(80)).toEqual([81, 82, 83]);
    });

    it('should_notRunForEighty_when_theLevelDropsToEightyItself', async () => {
      await feed(85);

      await feed(80);

      expect(ranFor(80)).toEqual([]);
    });

    it('should_notRunForSeventyNine_when_theLevelIsBelow', async () => {
      await feed(85);

      await feed(79);

      expect(ranFor(80)).toEqual([]);
    });

    it('should_notRunWhenTheLevelRisesButStaysAtOrBelowEighty', async () => {
      await feed(70);

      await feed(75, 79, 80);

      expect(ranFor(80)).toEqual([]);
    });

    it('should_runAgain_when_theLevelDropsBelowAndComesBackAbove', async () => {
      await feed(85);

      await feed(86); // above
      await feed(79); // drops below: nothing
      await feed(80); // at the number: nothing
      await feed(81); // back above

      expect(ranFor(80)).toEqual([86, 81]);
    });

    it('should_runForALevelAboveEightyThatIsLowerThanThePreviousOne', async () => {
      // Every change above the number counts, in either direction
      await feed(95);

      await feed(90);

      expect(ranFor(80)).toEqual([90]);
    });

    it('should_notRunWhenTheLevelIsUnchanged', async () => {
      await feed(85);

      await feed(85, 85, 85);

      expect(batteryCard.trigger).not.toHaveBeenCalled();
      expect(ranFor(80)).toEqual([]);
    });

    it('should_notRunForTheFirstLevelAfterStartup', async () => {
      await feed(95);

      expect(batteryCard.trigger).not.toHaveBeenCalled();
      expect(ranFor(80)).toEqual([]);
    });

    it('should_notRunForTheFirstLevelAfterStartup_whenTheCacheRestoredADifferentLevel', async () => {
      // currentVehicleState is restored from the cache at startup and can be hours old
      vehicle.currentVehicleState = statusWithLevel(60);

      await feed(95);

      expect(batteryCard.trigger).not.toHaveBeenCalled();

      await feed(96);

      expect(ranFor(80)).toEqual([96]);
    });

    it('should_notRunWhenTheLevelIsUnknown', async () => {
      await feed(85);

      await feed(undefined);
      await update(statusWithLevel(undefined, { electric: undefined }));

      expect(batteryCard.trigger).not.toHaveBeenCalled();
      expect(ranFor(80)).toEqual([]);
    });

    it('should_notRunForTheFirstKnownLevelAfterAnUnknownOne_butRunForTheNextChange', async () => {
      await feed(undefined);

      await feed(90);
      expect(batteryCard.trigger).not.toHaveBeenCalled();

      await feed(91);
      expect(ranFor(80)).toEqual([91]);
    });

    it('should_neverTreatAMissingLevelAsZeroPercent', async () => {
      // A missing battery header used to be read as 0%: 85 -> 0 -> 85 would have fired twice
      await feed(85);

      await feed(undefined, 85);

      expect(batteryCard.trigger).not.toHaveBeenCalled();
    });

    it('should_treatZeroAsAKnownLevel', async () => {
      await feed(5);

      await feed(0);
      expect(batteryCard.trigger).toHaveBeenCalledTimes(1);
      expect(ranFor(80)).toEqual([]);

      await feed(81);
      expect(ranFor(80)).toEqual([81]);
    });
  });

  describe('what the trigger is fired with', () => {
    it('should_passTheNewLevelAsTheTokenAndInTheState', async () => {
      await feed(80);

      await feed(81);

      expect(batteryCard.trigger).toHaveBeenCalledTimes(1);
      expect(batteryCard.trigger).toHaveBeenCalledWith(vehicle, { battery: 81 }, { level: 81 });
    });

    it('should_fireForEveryChange_andLetTheRunListenerFilter', async () => {
      // The trigger itself does not know any flow's percentage
      await feed(80);

      await feed(79, 80, 81);

      expect(batteryCard.trigger).toHaveBeenCalledTimes(3);
      expect(ranFor(80)).toEqual([81]);
    });

    it('should_stillWriteTheBatteryCapability', async () => {
      await feed(80);

      await feed(81);

      expect(setCapabilityValueSafeSpy).toHaveBeenCalledWith(Capabilities.MEASURE_BATTERY, 81);
    });
  });

  describe('flows with different percentages', () => {
    beforeEach(() => {
      flows = [50, 80, 90];
    });

    it('should_runEachFlowOnlyWhenTheNewLevelIsAboveItsOwnPercentage', async () => {
      await feed(40);

      await feed(60); // above 50 only
      await feed(85); // above 50 and 80
      await feed(95); // above all three
      await feed(90); // above 50 and 80; 90 is not above 90
      await feed(30); // above none

      expect(ranFor(50)).toEqual([60, 85, 95, 90]);
      expect(ranFor(80)).toEqual([85, 95, 90]);
      expect(ranFor(90)).toEqual([95]);
    });

    it('should_fireTheTriggerOncePerChange_notOncePerFlow', async () => {
      await feed(40);

      await feed(60, 85, 95);

      expect(batteryCard.trigger).toHaveBeenCalledTimes(3);
    });
  });

  describe('never firing twice', () => {
    it('should_fireOnlyOnce_when_theSameNewLevelIsAppliedAgain', async () => {
      await feed(80);

      await feed(85, 85, 85);

      expect(batteryCard.trigger).toHaveBeenCalledTimes(1);
      expect(ranFor(80)).toEqual([85]);
    });

    it('should_fireOnlyOnce_when_twoUpdatesOverlapAndCarryTheSameNewLevel', async () => {
      // The first update is still busy (waiting on a capability write) when the second starts, so
      // currentVehicleState has not been replaced yet
      await feed(80);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));

      const first = update(statusWithLevel(85));
      const second = update(
        statusWithLevel(85, { lastUpdatedAt: new Date('2026-11-04T10:00:01Z') })
      );
      release();
      await Promise.all([first, second]);

      expect(batteryCard.trigger).toHaveBeenCalledTimes(1);
      expect(ranFor(80)).toEqual([85]);
    });

    it('should_notFireTwice_when_aSettingsUpdateRunsWhileAnMqttUpdateIsBusy', async () => {
      await feed(80);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));
      const next = statusWithLevel(85);

      const fromMqtt = update(next);
      const fromSettings = (vehicle as any).updateCapabilitiesFromStatus(next, {
        distanceUnit: 'imperial',
      });
      release();
      await Promise.all([fromMqtt, fromSettings]);

      expect(batteryCard.trigger).toHaveBeenCalledTimes(1);
    });

    it('should_fireOnceForEachOfTwoOverlappingUpdatesWithDifferentLevels', async () => {
      await feed(80);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      setCapabilityValueSafeSpy.mockImplementation(() => gate.then(() => true));

      const first = update(statusWithLevel(81));
      const second = update(statusWithLevel(82));
      release();
      await Promise.all([first, second]);

      expect(ranFor(80).sort()).toEqual([81, 82]);
    });
  });

  describe('when a trigger fails', () => {
    it('should_logAndKeepGoing_when_theTriggerRejects', async () => {
      await feed(80);
      batteryCard.trigger.mockRejectedValue(new Error('flow engine down'));

      await expect(update(statusWithLevel(85))).resolves.toBeUndefined();

      expect((vehicle as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining(Flows.BATTERY_LEVEL_ABOVE),
        expect.objectContaining({ message: 'flow engine down' })
      );
    });
  });
});
