/**
 * Tests that a log level saved on the settings page applies to the running app.
 *
 * The settings page replaces the whole configuration object (saveSettings ->
 * ConfigurationManager.setConfiguration). The loggers must read the current configuration each
 * time they log instead of holding on to the object that existed when the app started, or a
 * change would only take effect after an app restart.
 *
 * The shared Homey mock has no default export and no SimpleClass, which the app and the Loki
 * logger extend, so the module is extended with minimal ones here.
 */

jest.mock('homey', () => ({
  ...jest.requireActual('./__mocks__/homey'),
  __esModule: true,
  default: { App: class {} },
  SimpleClass: class {},
}));

import type { BMWConnectedDrive } from '../app';
import { saveSettings } from '../api';
import { LogLevel } from '../lib';
import { Configuration } from '../utils/Configuration';
import { ConfigurationManager } from '../utils/ConfigurationManager';

// app.ts ends with `module.exports = BMWConnectedDrive`, so the class is the module itself
const AppClass = jest.requireActual<typeof BMWConnectedDrive>('../app');

const LOKI_URL = 'http://loki.example.test/loki/api/v1/push';

describe('BMWConnectedDrive log level', () => {
  let settings: Map<string, unknown>;
  let homey: any;
  let app: BMWConnectedDrive;
  let fetchMock: jest.Mock;

  /** What the settings page sends: the stored configuration with some fields replaced */
  const saveFromSettingsPage = (changes: Partial<Configuration>) =>
    saveSettings({
      homey,
      body: {
        ...ConfigurationManager.getConfiguration(homey),
        ...changes,
      },
    });

  const startApp = async (stored: Partial<Configuration> = {}) => {
    settings.set(ConfigurationManager._settingsKey, {
      ...new Configuration(),
      currentVersion: '1.1.0',
      ...stored,
    });
    app = Object.create(AppClass.prototype) as BMWConnectedDrive;
    (app as any).homey = homey;
    await app.onInit();
  };

  beforeEach(() => {
    ConfigurationManager.configurationCache = undefined as any;
    settings = new Map();
    homey = {
      settings: {
        get: jest.fn((key: string) => settings.get(key)),
        set: jest.fn((key: string, value: unknown) => settings.set(key, value)),
      },
      app: { manifest: { version: '1.1.0' } },
      manifest: { id: 'com.example.bmw', version: '1.1.0' },
      version: '12.5.0',
      log: jest.fn(),
      error: jest.fn(),
      flow: {
        getConditionCard: jest.fn(() => ({
          registerRunListener: jest.fn(),
          registerArgumentAutocompleteListener: jest.fn(),
        })),
        getDeviceTriggerCard: jest.fn(() => ({ registerRunListener: jest.fn() })),
      },
    };
    fetchMock = jest.fn().mockResolvedValue({ ok: true, statusText: 'OK' });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ConfigurationManager.configurationCache = undefined as any;
  });

  /** Log lines the standard logger wrote to the Homey log */
  const loggedLines = () => homey.log.mock.calls.map(([line]: [string]) => line);

  /** Messages the Loki logger sent to Loki */
  const sentToLoki = () =>
    fetchMock.mock.calls.map(([, init]: [string, { body: string }]) => init.body);

  describe('standard logger', () => {
    it('should_startQuiet_when_loggingIsDisabled', async () => {
      await startApp({ logEnabled: false, logLevel: LogLevel.DEBUG });

      app.logger?.debug('debug before');
      app.logger?.info('info before');

      expect(loggedLines().join('\n')).not.toContain('before');
    });

    it('should_applyASavedLogLevelWithoutARestart_when_loggingIsEnabledLater', async () => {
      await startApp({ logEnabled: false, logLevel: LogLevel.WARN });
      app.logger?.debug('debug before');

      await saveFromSettingsPage({ logEnabled: true, logLevel: LogLevel.DEBUG });
      app.logger?.debug('debug after');

      const lines = loggedLines().join('\n');
      expect(lines).not.toContain('debug before');
      expect(lines).toContain('DEBUG: debug after');
    });

    it('should_applyASavedLogLevelWithoutARestart_when_theLevelIsRaised', async () => {
      await startApp({ logEnabled: true, logLevel: LogLevel.DEBUG });
      app.logger?.debug('debug before');

      await saveFromSettingsPage({ logLevel: LogLevel.ERROR });
      app.logger?.debug('debug after');
      app.logger?.warn('warn after');

      const lines = loggedLines().join('\n');
      expect(lines).toContain('DEBUG: debug before');
      expect(lines).not.toContain('debug after');
      expect(lines).not.toContain('warn after');
    });

    it('should_applyASavedLogLevelWithoutARestart_when_loggingIsDisabledLater', async () => {
      await startApp({ logEnabled: true, logLevel: LogLevel.DEBUG });

      await saveFromSettingsPage({ logEnabled: false });
      app.logger?.info('info after');
      app.logger?.error('error after');

      expect(loggedLines().join('\n')).not.toContain('info after');
      // Errors are always logged
      expect(homey.error).toHaveBeenCalledWith(expect.stringContaining('error after'));
    });

    it('should_followEverySave_when_theSettingsAreSavedMoreThanOnce', async () => {
      await startApp({ logEnabled: true, logLevel: LogLevel.WARN });

      await saveFromSettingsPage({ logLevel: LogLevel.DEBUG });
      app.logger?.debug('first');
      await saveFromSettingsPage({ logLevel: LogLevel.WARN });
      app.logger?.debug('second');
      await saveFromSettingsPage({ logLevel: LogLevel.TRACE });
      app.logger?.trace('third');

      const lines = loggedLines().join('\n');
      expect(lines).toContain('first');
      expect(lines).not.toContain('second');
      expect(lines).toContain('third');
    });
  });

  describe('Loki logger', () => {
    it('should_useTheLokiLogger_when_aLokiUrlIsConfigured', async () => {
      await startApp({ lokiUrl: LOKI_URL, logEnabled: true, logLevel: LogLevel.INFO });

      app.logger?.info('hello loki');

      expect(sentToLoki().join('\n')).toContain('hello loki');
    });

    it('should_applyASavedLogLevelWithoutARestart_when_loggingIsEnabledLater', async () => {
      await startApp({ lokiUrl: LOKI_URL, logEnabled: false, logLevel: LogLevel.WARN });
      app.logger?.debug('debug before');

      await saveFromSettingsPage({ logEnabled: true, logLevel: LogLevel.DEBUG });
      app.logger?.debug('debug after');

      const sent = sentToLoki().join('\n');
      expect(sent).not.toContain('debug before');
      expect(sent).toContain('debug after');
    });

    it('should_applyASavedLogLevelWithoutARestart_when_theLevelIsRaised', async () => {
      await startApp({ lokiUrl: LOKI_URL, logEnabled: true, logLevel: LogLevel.DEBUG });
      app.logger?.debug('debug before');

      await saveFromSettingsPage({ logLevel: LogLevel.ERROR });
      app.logger?.debug('debug after');

      const sent = sentToLoki().join('\n');
      expect(sent).toContain('debug before');
      expect(sent).not.toContain('debug after');
    });

    it('should_reportTheCurrentLevel_when_theConfigurationWasReplaced', async () => {
      await startApp({ lokiUrl: LOKI_URL, logEnabled: true, logLevel: LogLevel.DEBUG });
      expect((app.logger as any).getLevel()).toBe(LogLevel.DEBUG);

      await saveFromSettingsPage({ logLevel: LogLevel.ERROR });

      expect((app.logger as any).getLevel()).toBe(LogLevel.ERROR);
    });
  });
});
