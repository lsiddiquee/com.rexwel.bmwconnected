/**
 * LokiLogger log level tests.
 *
 * The level is asked from the level source on every log call, so a level changed while the app
 * runs (saved on the settings page) applies straight away instead of after a restart.
 *
 * The shared Homey mock has no SimpleClass, which the logger extends, so the module is extended
 * with a minimal one here.
 */

jest.mock('homey', () => ({
  ...jest.requireActual('../__mocks__/homey'),
  SimpleClass: class {},
}));

import { LogLevel } from '../../lib';
import { LokiLogger } from '../../utils/LokiLogger';

describe('LokiLogger log level', () => {
  let level: LogLevel;
  let fetchMock: jest.Mock;
  let logger: LokiLogger;

  const sent = () =>
    fetchMock.mock.calls.map(([, init]: [string, { body: string }]) => init.body).join('\n');

  beforeEach(() => {
    level = LogLevel.WARN;
    fetchMock = jest.fn().mockResolvedValue({ ok: true, statusText: 'OK' });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logger = new LokiLogger(
      { manifest: { id: 'app', version: '1.0.0' } },
      'http://loki.test',
      () => level
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should_filterByTheLevelSource_when_loggingAtDifferentLevels', () => {
    logger.debug('debug line');
    logger.warn('warn line');

    expect(sent()).not.toContain('debug line');
    expect(sent()).toContain('warn line');
  });

  it('should_followTheLevelSource_when_theLevelChangesAfterConstruction', () => {
    logger.debug('debug before');
    level = LogLevel.DEBUG;
    logger.debug('debug after');
    level = LogLevel.ERROR;
    logger.warn('warn later');

    expect(sent()).not.toContain('debug before');
    expect(sent()).toContain('debug after');
    expect(sent()).not.toContain('warn later');
  });

  it('should_reportTheCurrentLevel_when_askedForIt', () => {
    expect(logger.getLevel()).toBe(LogLevel.WARN);

    level = LogLevel.TRACE;

    expect(logger.getLevel()).toBe(LogLevel.TRACE);
  });

  it('should_pinTheLevel_when_setLevelIsCalled', () => {
    logger.setLevel(LogLevel.ERROR);
    level = LogLevel.TRACE;

    logger.warn('warn line');

    expect(logger.getLevel()).toBe(LogLevel.ERROR);
    expect(sent()).not.toContain('warn line');
  });
});
