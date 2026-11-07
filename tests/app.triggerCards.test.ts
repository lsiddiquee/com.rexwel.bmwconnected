/**
 * Tests for the trigger cards that need a run listener in the app
 *
 * "Battery level changed and is above ..." fires on every change of the battery level; Homey then
 * calls the run listener once per flow, with that flow's own percentage, to decide which flows run.
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

import type { BMWConnectedDrive } from '../app';
import { Flows } from '../utils/Flows';

// app.ts ends with `module.exports = BMWConnectedDrive`, so the class is the module itself
const AppClass = jest.requireActual<typeof BMWConnectedDrive>('../app');

type RunListener = (args: any, state: any) => unknown;

describe('BMWConnectedDrive trigger cards', () => {
  let runListeners: Map<string, RunListener>;
  let getDeviceTriggerCard: jest.Mock;

  beforeEach(() => {
    runListeners = new Map();
    getDeviceTriggerCard = jest.fn((id: string) => ({
      registerRunListener: jest.fn((listener: RunListener) => {
        runListeners.set(id, listener);
      }),
    }));

    const app = Object.create(AppClass.prototype) as BMWConnectedDrive;
    (app as any).homey = { flow: { getDeviceTriggerCard } };
    app['registerTriggerCards']();
  });

  describe('battery_level_above', () => {
    const device = {};
    /** Ask whether a flow with this percentage runs for a battery change to this level */
    const runs = (percentage: unknown, level: unknown) =>
      runListeners.get(Flows.BATTERY_LEVEL_ABOVE)?.({ device, percentage }, { level });

    it('should_registerARunListener_when_appStarts', () => {
      expect(Flows.BATTERY_LEVEL_ABOVE).toBe('battery_level_above');
      expect(getDeviceTriggerCard).toHaveBeenCalledWith(Flows.BATTERY_LEVEL_ABOVE);
      expect(runListeners.has(Flows.BATTERY_LEVEL_ABOVE)).toBe(true);
    });

    it.each([
      [80, 81, true],
      [80, 82, true],
      [80, 100, true],
      [80, 80, false],
      [80, 79, false],
      [80, 0, false],
      [0, 1, true],
      [0, 0, false],
      [99, 100, true],
      [100, 100, false],
    ])('should_withPercentage_%s_andNewLevel_%s_return_%s', (percentage, level, expected) => {
      expect(runs(percentage, level)).toBe(expected);
    });

    it('should_runAFlowAboveItsOwnThreshold_andNotTheOthers_when_flowsUseDifferentPercentages', () => {
      // One change, three flows with their own percentage
      const flows = [50, 80, 90];

      expect(flows.map((percentage) => runs(percentage, 85))).toEqual([true, true, false]);
      expect(flows.map((percentage) => runs(percentage, 91))).toEqual([true, true, true]);
      expect(flows.map((percentage) => runs(percentage, 80))).toEqual([true, false, false]);
      expect(flows.map((percentage) => runs(percentage, 40))).toEqual([false, false, false]);
    });

    it('should_compareStrictlyAboveANumberThatArrivesAsText', () => {
      expect(runs('80', 81)).toBe(true);
      expect(runs('80', 80)).toBe(false);
    });

    it.each([
      ['undefined', undefined],
      ['not a number', 'abc'],
    ])('should_notRun_when_thePercentageIs_%s', (_name, percentage) => {
      expect(runs(percentage, 90)).toBe(false);
    });

    it('should_notRun_when_theStateCarriesNoLevel', () => {
      expect(runs(80, undefined)).toBe(false);
    });
  });
});
