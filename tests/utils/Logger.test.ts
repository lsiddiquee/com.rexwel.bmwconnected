/**
 * Logger regression tests.
 *
 * Bug (issue #108): `Logger.error(message, undefined, context)` was overwriting
 * the caller's `context.error` and `context.stack` fields with `undefined`,
 * causing diagnostic data passed via the context to be silently dropped from
 * the serialized log output. v1.0.18 must preserve caller-supplied context
 * keys when no Error object is provided.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { SimpleClass } from 'homey';
import { Logger } from '../../utils/Logger';
import { LogLevel } from '../../lib';

describe('Logger', () => {
  let homeyLogger: { log: jest.Mock; error: jest.Mock };
  let logger: Logger;

  beforeEach(() => {
    homeyLogger = { log: jest.fn(), error: jest.fn() };
    logger = new Logger(homeyLogger as unknown as SimpleClass, () => LogLevel.DEBUG);
  });

  describe('error(message, error?, context?)', () => {
    it('should_preserveContextErrorField_when_noErrorObjectProvided', () => {
      // Arrange - caller supplies diagnostic info in context only (no Error)
      // Act
      logger.error('Device code request failed', undefined, {
        status: 400,
        statusText: 'Bad Request',
        error: 'invalid_client',
      });

      // Assert - the context.error field must survive the call. Previously it
      // was being overwritten with `undefined` because the Error parameter was
      // not provided.
      const written = homeyLogger.error.mock.calls[0]?.[0] as string;
      expect(written).toContain('invalid_client');
      expect(written).toContain('400');
      expect(written).toContain('Bad Request');
    });

    it('should_includeErrorMessageAndStack_when_errorObjectProvided', () => {
      // Arrange
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at test';

      // Act
      logger.error('Something exploded', err);

      // Assert
      const written = homeyLogger.error.mock.calls[0]?.[0] as string;
      expect(written).toContain('boom');
      expect(written).toContain('at test');
    });

    it('should_logArbitraryContext_when_neitherErrorNorOverlap', () => {
      // Arrange
      // Act
      logger.error('HTTP request failed', undefined, {
        method: 'POST',
        url: 'https://api-cardata.bmwgroup.com/customers/containers',
        status: 403,
        headers: { 'x-correlation-id': 'abc-123' },
        body: '{}',
      });

      // Assert - all diagnostic fields must reach the underlying logger so the
      // user-shared logs contain enough to debug. Previously the entire context
      // object was dropped because it was passed as `error` (2nd arg).
      const written = homeyLogger.error.mock.calls[0]?.[0] as string;
      expect(written).toContain('POST');
      expect(written).toContain('/customers/containers');
      expect(written).toContain('403');
      expect(written).toContain('abc-123');
    });
  });

  describe('fatal(message, error?, context?)', () => {
    it('should_preserveContextErrorField_when_noErrorObjectProvided', () => {
      // Same bug symmetric for fatal(). Act + Assert.
      logger.fatal('Catastrophic failure', undefined, { error: 'disk_full' });
      const written = homeyLogger.log.mock.calls[0]?.[0] as string;
      expect(written).toContain('disk_full');
    });
  });
});
