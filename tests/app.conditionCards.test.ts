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

  describe('car_data_fresh', () => {
    it('should_askTheDeviceWithTheMinutesAsNumber_when_conditionRuns', () => {
      const device = { isCarDataFresh: jest.fn().mockReturnValue(true) };

      const result = runListeners.get(Flows.CAR_DATA_FRESH_CONDITION)?.({ device, minutes: '30' });

      expect(result).toBe(true);
      expect(device.isCarDataFresh).toHaveBeenCalledWith(30);
    });
  });
});
