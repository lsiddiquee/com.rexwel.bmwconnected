/**
 * Tests for the app side of the "Car battery" dashboard widget: the state it gets for a car, and
 * the car picker in its settings.
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
import * as batteryWidgetApi from '../widgets/battery/api';

// app.ts ends with `module.exports = BMWConnectedDrive`, so the class is the module itself
const AppClass = jest.requireActual<typeof BMWConnectedDrive>('../app');

type AutocompleteListener = (query: string, settings?: unknown) => Promise<unknown[]>;

const fakeVehicle = (id: string, name: string) => ({
  getData: () => ({ id }),
  getName: () => name,
  getBatteryWidgetState: jest.fn(() => ({
    deviceId: id,
    name,
    charge: 'UNKNOWN',
    rangeUnit: 'km',
  })),
});

describe('BMWConnectedDrive battery widget', () => {
  let app: BMWConnectedDrive;
  let homey: any;
  let drivers: Record<string, { getDevices: () => unknown[] }>;
  let listeners: Map<string, AutocompleteListener>;
  let getWidget: jest.Mock;
  let logger: { warn: jest.Mock };

  const i4 = fakeVehicle('VIN_I4', 'BMW i4');
  const ix3 = fakeVehicle('VIN_IX3', 'Family iX3');
  const mini = fakeVehicle('VIN_MINI', 'Mini Cooper SE');

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = new Map();
    getWidget = jest.fn(() => ({
      registerSettingAutocompleteListener: jest.fn(
        (name: string, listener: AutocompleteListener) => {
          listeners.set(name, listener);
        }
      ),
    }));
    drivers = {
      bmw: { getDevices: () => [i4, ix3] },
      mini: { getDevices: () => [mini] },
    };
    homey = {
      drivers: { getDrivers: () => drivers },
      dashboards: { getWidget },
    };
    logger = { warn: jest.fn() };

    app = Object.create(AppClass.prototype) as BMWConnectedDrive;
    (app as any).homey = homey;
    (app as any).logger = logger;
  });

  describe('getBatteryWidgetState', () => {
    it('should_returnTheStateOfTheCarWithThatId_acrossAllDrivers', () => {
      expect(app.getBatteryWidgetState('VIN_MINI')).toMatchObject({ deviceId: 'VIN_MINI' });
      expect(app.getBatteryWidgetState('VIN_IX3')).toMatchObject({ deviceId: 'VIN_IX3' });
      expect(mini.getBatteryWidgetState).toHaveBeenCalledTimes(1);
      expect(i4.getBatteryWidgetState).not.toHaveBeenCalled();
    });

    it('should_fallBackToTheFirstCar_when_noIdIsGiven', () => {
      expect(app.getBatteryWidgetState()).toMatchObject({ deviceId: 'VIN_I4' });
      expect(app.getBatteryWidgetState(undefined)).toMatchObject({ deviceId: 'VIN_I4' });
    });

    it('should_fallBackToTheFirstCar_when_noCarHasThatId', () => {
      expect(app.getBatteryWidgetState('REMOVED_CAR')).toMatchObject({ deviceId: 'VIN_I4' });
    });

    it('should_fallBackToTheFirstCar_when_theIdIsEmpty', () => {
      expect(app.getBatteryWidgetState('')).toMatchObject({ deviceId: 'VIN_I4' });
    });

    it('should_findTheFirstCar_when_theFirstDriverHasNone', () => {
      drivers = { bmw: { getDevices: () => [] }, mini: { getDevices: () => [mini] } };
      homey.drivers.getDrivers = () => drivers;

      expect(app.getBatteryWidgetState()).toMatchObject({ deviceId: 'VIN_MINI' });
    });

    it('should_returnNull_when_theAppHasNoCars', () => {
      drivers = { bmw: { getDevices: () => [] }, mini: { getDevices: () => [] } };
      homey.drivers.getDrivers = () => drivers;

      expect(app.getBatteryWidgetState('VIN_I4')).toBeNull();
      expect(app.getBatteryWidgetState()).toBeNull();
    });
  });

  describe('car picker', () => {
    beforeEach(() => {
      app['registerBatteryWidget']();
    });

    it('should_registerTheCarAutocompleteOfTheBatteryWidget', () => {
      expect(getWidget).toHaveBeenCalledWith('battery');
      expect(listeners.has('car')).toBe(true);
    });

    it('should_listEveryCar_when_nothingIsTyped', async () => {
      await expect(listeners.get('car')?.('')).resolves.toEqual([
        { name: 'BMW i4', id: 'VIN_I4' },
        { name: 'Family iX3', id: 'VIN_IX3' },
        { name: 'Mini Cooper SE', id: 'VIN_MINI' },
      ]);
    });

    it('should_filterByNameIgnoringCase', async () => {
      await expect(listeners.get('car')?.('IX3')).resolves.toEqual([
        { name: 'Family iX3', id: 'VIN_IX3' },
      ]);
      await expect(listeners.get('car')?.('mini')).resolves.toEqual([
        { name: 'Mini Cooper SE', id: 'VIN_MINI' },
      ]);
    });

    it('should_listNothing_when_noNameMatches', async () => {
      await expect(listeners.get('car')?.('tesla')).resolves.toEqual([]);
    });

    it('should_notThrow_andWarn_when_theWidgetCannotBeRegistered', () => {
      getWidget.mockImplementation(() => {
        throw new Error('no such widget');
      });

      expect(() => app['registerBatteryWidget']()).not.toThrow();
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to register the battery widget: Error: no such widget'
      );
    });

    it('should_notThrow_when_homeyHasNoDashboardsManager', () => {
      delete homey.dashboards;

      expect(() => app['registerBatteryWidget']()).not.toThrow();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to register'));
    });

    it('should_beRegisteredWhenTheAppStarts', async () => {
      const register = jest.spyOn(app as any, 'registerBatteryWidget').mockImplementation();
      // The rest of onInit is covered elsewhere: stop it right after the widget
      jest.spyOn(app as any, 'registerTriggerCards').mockImplementation();
      jest.spyOn(app as any, 'registerConditionCards').mockImplementation();
      homey.settings = { get: jest.fn(() => ({ currentVersion: '1.1.0' })), set: jest.fn() };
      homey.manifest = { version: '1.1.0' };
      homey.app = { manifest: { version: '1.1.0' } };
      homey.log = jest.fn();
      jest.spyOn(app as any, 'migrate_configuration').mockImplementation();

      await app.onInit();

      expect(register).toHaveBeenCalledTimes(1);
    });
  });

  describe('widget API', () => {
    it('should_returnTheStateForTheDeviceIdInTheQuery', async () => {
      homey.app = app;

      const result = await batteryWidgetApi.getState({ homey, query: { deviceId: 'VIN_MINI' } });

      expect(result).toEqual({ state: expect.objectContaining({ deviceId: 'VIN_MINI' }) });
    });

    it('should_returnTheFirstCar_when_theQueryHasNoDeviceId', async () => {
      homey.app = app;

      const result = await batteryWidgetApi.getState({ homey, query: {} });

      expect(result.state).toMatchObject({ deviceId: 'VIN_I4' });
    });

    it('should_returnNullState_when_theAppHasNoCars', async () => {
      homey.app = app;
      homey.drivers.getDrivers = () => ({ bmw: { getDevices: () => [] } });

      await expect(batteryWidgetApi.getState({ homey, query: {} })).resolves.toEqual({
        state: null,
      });
    });
  });

  describe('widget definition', () => {
    const widget = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../widgets/battery/widget.compose.json'), 'utf8')
    );

    it('should_exposeTheStateEndpointThatTheWidgetApiImplements', () => {
      expect(widget.api).toEqual({ getState: { method: 'GET', path: '/state' } });
      expect(typeof batteryWidgetApi.getState).toBe('function');
    });

    it('should_exportEveryRouteByName_when_loadedTheWayHomeyLoadsIt', () => {
      // Homey requires the compiled CommonJS file and calls module.exports[routeName]. A default
      // export ends up under module.exports.default, where Homey does not look.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require('../widgets/battery/api') as Record<string, unknown>;

      for (const route of Object.keys(widget.api)) {
        expect(typeof loaded[route]).toBe('function');
      }
    });

    it('should_haveTheCarSettingTheAutocompleteListenerIsRegisteredFor', () => {
      expect(widget.settings.find((setting: any) => setting.id === 'car')).toMatchObject({
        type: 'autocomplete',
      });
    });

    it('should_defineTheStyleAndBackgroundChoices', () => {
      const values = (id: string) =>
        widget.settings
          .find((setting: any) => setting.id === id)
          .values.map((value: any) => value.id);

      expect(values('style')).toEqual(['battery', 'circle', 'number']);
      expect(values('background')).toEqual(['dark', 'light']);
    });
  });
});
