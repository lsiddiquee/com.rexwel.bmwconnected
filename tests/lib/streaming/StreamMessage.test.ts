/**
 * Unit Tests for StreamMessageValidator
 *
 * Tests MQTT message validation and parsing - CRITICAL for MQTT reliability
 */

import { describe, it, expect } from '@jest/globals';
import { StreamMessageValidator } from '../../../lib/streaming/StreamMessage';
import type { StreamMessage } from '../../../lib/streaming/StreamMessage';
import { MESSAGE_VALIDATION } from '../../../lib/streaming/constants';

describe('StreamMessageValidator', () => {
  // Helper to create a valid message for testing
  const createValidMessage = (): unknown => ({
    vin: '12345678901234567', // 17 characters
    entityId: '123e4567-e89b-12d3-a456-426614174000',
    topic: '12345678901234567', // Just VIN
    timestamp: '2025-10-29T10:00:00.000Z',
    data: {
      'vehicle.status.fuelLevel': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 50,
        unit: 'PERCENT',
      },
    },
  });

  describe('Group 1: validate() - Type Validation (4 tests)', () => {
    it('should_rejectNull_when_messageIsNull', () => {
      // Arrange
      const message = null;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectPrimitive_when_messageIsStringNumberBoolean', () => {
      // Arrange - Test string
      const stringMessage = 'not an object';
      const numberMessage = 123;
      const booleanMessage = true;

      // Act & Assert
      expect(StreamMessageValidator.validate(stringMessage)).toBe(false);
      expect(StreamMessageValidator.validate(numberMessage)).toBe(false);
      expect(StreamMessageValidator.validate(booleanMessage)).toBe(false);
    });

    it('should_rejectArray_when_messageIsArray', () => {
      // Arrange
      const message = ['not', 'an', 'object'];

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_acceptObject_when_messageIsPlainObject', () => {
      // Arrange
      const message = createValidMessage();

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Group 2: validate() - Required Fields (5 tests)', () => {
    it('should_rejectMissing_when_vinUndefined', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      delete message.vin;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectMissing_when_entityIdUndefined', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      delete message.entityId;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectMissing_when_topicUndefined', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      delete message.topic;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectMissing_when_timestampUndefined', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      delete message.timestamp;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectMissing_when_dataUndefined', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      delete message.data;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Group 3: validate() - Field Types (4 tests)', () => {
    it('should_rejectWrongType_when_vinNotString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.vin = 123;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectWrongType_when_entityIdNotString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.entityId = { id: '123' };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectWrongType_when_topicNotString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.topic = ['topic'];

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectWrongType_when_timestampNotString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = Date.now();

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Group 4: validate() - VIN Validation (3 tests)', () => {
    it('should_rejectShortVin_when_length16', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.vin = '1234567890123456'; // 16 characters
      message.topic = message.vin;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectLongVin_when_length18', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.vin = '123456789012345678'; // 18 characters
      message.topic = message.vin;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_acceptValidVin_when_length17', () => {
      // Arrange
      const message = createValidMessage();

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Group 5: validate() - Topic Validation (4 tests)', () => {
    it('should_acceptTopic_when_formatIsGcidSlashVin', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.topic = 'gcid-12345/12345678901234567';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptTopic_when_formatIsJustVin', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.topic = '12345678901234567';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_rejectInvalidTopic_when_vinNotAtEnd', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.topic = '12345678901234567/something-else';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectInvalidTopic_when_topicEmpty', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.topic = '';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Group 6: validate() - Timestamp Validation (6 tests)', () => {
    it('should_acceptTimestamp_when_withMilliseconds3Digits', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = '2025-10-18T20:31:42.312Z';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptTimestamp_when_withMilliseconds2Digits', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = '2025-10-21T06:16:45.61Z';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptTimestamp_when_withMilliseconds1Digit', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = '2025-10-21T06:16:45.6Z';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptTimestamp_when_withoutMilliseconds', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = '2025-10-18T20:31:43Z';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_rejectInvalidTimestamp_when_notIso8601', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = '10/29/2025 10:00:00';

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectInvalidTimestamp_when_malformedDate', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.timestamp = '2025-13-40T25:61:99.999Z'; // Invalid month/day/time

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Group 7: validate() - Data Object Validation (5 tests)', () => {
    it('should_rejectNullData_when_dataIsNull', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.data = null;

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectArrayData_when_dataIsArray', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.data = [];

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectEmptyData_when_noKeys', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      message.data = {};

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_acceptValidData_when_singleDataPoint', () => {
      // Arrange
      const message = createValidMessage();

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptValidData_when_multipleDataPoints', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.range'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 450,
        unit: 'KM',
      };
      (message.data as Record<string, unknown>)['vehicle.location.latitude'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 52.52,
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Group 8: validate() - TelematicDataPoint Validation (10 tests)', () => {
    it('should_rejectDataPoint_when_timestampMissing', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.fuelLevel'] = {
        value: 50,
        unit: 'PERCENT',
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectDataPoint_when_valueMissing', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.fuelLevel'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        unit: 'PERCENT',
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectDataPoint_when_timestampNotString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.fuelLevel'] = {
        timestamp: Date.now(),
        value: 50,
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_rejectDataPoint_when_valueNull', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.fuelLevel'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: null,
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_acceptDataPoint_when_valueIsString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.state'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 'LOCKED',
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptDataPoint_when_valueIsNumber', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.mileage'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 45000,
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptDataPoint_when_valueIsBoolean', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.doorLocked'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: true,
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptDataPoint_when_unitOptional', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.doorLocked'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: true,
        // No unit
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_acceptDataPoint_when_unitProvided', () => {
      // Arrange
      const message = createValidMessage();

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_rejectDataPoint_when_unitNotString', () => {
      // Arrange
      const message = createValidMessage() as Record<string, unknown>;
      (message.data as Record<string, unknown>)['vehicle.status.fuelLevel'] = {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 50,
        unit: 123,
      };

      // Act
      const result = StreamMessageValidator.validate(message);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Group 9: parse() - Buffer Parsing (5 tests)', () => {
    it('should_parseValid_when_bufferContainsValidJson', () => {
      // Arrange
      const validMessage = createValidMessage();
      const buffer = Buffer.from(JSON.stringify(validMessage), 'utf8');

      // Act
      const result = StreamMessageValidator.parse(buffer);

      // Assert
      expect(result).toBeDefined();
      expect(result.vin).toBe('12345678901234567');
      expect(result.data['vehicle.status.fuelLevel'].source).toBe('mqtt');
    });

    it('should_throwError_when_bufferTooLarge', () => {
      // Arrange - Create buffer larger than 1MB
      const largeString = 'x'.repeat(MESSAGE_VALIDATION.MAX_MESSAGE_SIZE + 1);
      const buffer = Buffer.from(largeString, 'utf8');

      // Act & Assert
      expect(() => StreamMessageValidator.parse(buffer)).toThrow('Message too large');
    });

    it('should_throwError_when_bufferNotValidJson', () => {
      // Arrange
      const buffer = Buffer.from('not valid json{', 'utf8');

      // Act & Assert
      expect(() => StreamMessageValidator.parse(buffer)).toThrow('Invalid JSON');
    });

    it('should_throwError_when_jsonInvalidSchema', () => {
      // Arrange
      const invalidMessage = { invalid: 'schema' };
      const buffer = Buffer.from(JSON.stringify(invalidMessage), 'utf8');

      // Act & Assert
      expect(() => StreamMessageValidator.parse(buffer)).toThrow('Invalid StreamMessage schema');
    });

    it('should_addSourceMarker_when_parsingSuccess', () => {
      // Arrange
      const validMessage = createValidMessage();
      const buffer = Buffer.from(JSON.stringify(validMessage), 'utf8');

      // Act
      const result = StreamMessageValidator.parse(buffer);

      // Assert
      expect(result.data['vehicle.status.fuelLevel'].source).toBe('mqtt');
    });
  });

  describe('Group 10: isMessageFresh() - Freshness Check (4 tests)', () => {
    it('should_returnTrue_when_messageRecent', () => {
      // Arrange
      const message: StreamMessage = {
        ...(createValidMessage() as StreamMessage),
        timestamp: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };

      // Act
      const result = StreamMessageValidator.isMessageFresh(message);

      // Assert
      expect(result).toBe(true);
    });

    it('should_returnFalse_when_messageTooOld', () => {
      // Arrange
      const message: StreamMessage = {
        ...(createValidMessage() as StreamMessage),
        timestamp: new Date(Date.now() - MESSAGE_VALIDATION.MAX_MESSAGE_AGE - 1000).toISOString(),
      };

      // Act
      const result = StreamMessageValidator.isMessageFresh(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_returnFalse_when_timestampInFuture', () => {
      // Arrange
      const message: StreamMessage = {
        ...(createValidMessage() as StreamMessage),
        timestamp: new Date(Date.now() + 60000).toISOString(), // 1 minute in future
      };

      // Act
      const result = StreamMessageValidator.isMessageFresh(message);

      // Assert
      expect(result).toBe(false);
    });

    it('should_returnFalse_when_timestampInvalid', () => {
      // Arrange
      const message: StreamMessage = {
        ...(createValidMessage() as StreamMessage),
        timestamp: 'invalid-timestamp',
      };

      // Act
      const result = StreamMessageValidator.isMessageFresh(message);

      // Assert
      expect(result).toBe(false);
    });
  });
});
