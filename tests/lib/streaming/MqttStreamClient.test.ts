import { describe, it, expect, jest } from '@jest/globals';
import { MqttStreamClient } from '../../../lib/streaming/MqttStreamClient';
import { IAuthProvider } from '../../../lib/auth/IAuthProvider';
import { ILogger, LogLevel } from '../../../lib/types/ILogger';
import { AuthToken, DeviceCodeResponse } from '../../../lib/models/AuthToken';

const mockLogger: ILogger = {
  log: jest.fn(),
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  setLevel: jest.fn(),
  getLevel: jest.fn<() => LogLevel>().mockReturnValue(LogLevel.INFO),
};

const mockAuthProvider: IAuthProvider = {
  getToken: jest.fn<() => Promise<AuthToken>>().mockResolvedValue({
    gcid: 'mockGcid',
    accessToken: 'mockAccessToken',
    refreshToken: 'mockRefreshToken',
    idToken: 'mockIdToken',
    tokenType: 'Bearer',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }),
  requestDeviceCode: jest.fn<() => Promise<DeviceCodeResponse>>().mockResolvedValue({
    userCode: 'mockUserCode',
    deviceCode: 'mockDeviceCode',
    verificationUrl: 'https://mock.verification.uri',
    expiresIn: 1800,
    interval: 5,
  }),
  pollForTokens: jest.fn<(deviceCode: string) => Promise<AuthToken>>().mockResolvedValue({
    gcid: 'mockGcid',
    accessToken: 'mockAccessToken',
    refreshToken: 'mockRefreshToken',
    idToken: 'mockIdToken',
    tokenType: 'Bearer',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }),
  refreshTokens: jest.fn<(refreshToken: string) => Promise<AuthToken>>().mockResolvedValue({
    gcid: 'mockGcid',
    accessToken: 'mockAccessToken',
    refreshToken: 'mockRefreshToken',
    idToken: 'mockIdToken',
    tokenType: 'Bearer',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }),
  getValidAccessToken: jest.fn<() => Promise<string>>().mockResolvedValue('mockAccessToken'),
  revokeTokens: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isAccessTokenExpired: jest.fn<() => boolean>().mockReturnValue(false),
  isRefreshTokenExpired: jest.fn<() => boolean>().mockReturnValue(false),
};

describe('MqttStreamClient.handleMessage', () => {
  let client: MqttStreamClient;

  beforeEach(() => {
    client = new MqttStreamClient(mockAuthProvider, {}, mockLogger, 'AAAAAAAAAAAAAAAAA');
    jest.clearAllMocks();
  });

  const testCases = [
    {
      description: 'Valid StreamMessage schema',
      topic: '187d32c4-6ce2-470f-9f3d-81ba54bcc4da/AAAAAAAAAAAAAAAAA',
      payload: Buffer.from(
        JSON.stringify({
          vin: 'AAAAAAAAAAAAAAAAA',
          entityId: '187d32c4-6ce2-470f-9f3d-81ba54bcc4da',
          topic: 'AAAAAAAAAAAAAAAAA',
          timestamp: '2025-10-21T06:16:45.61Z',
          data: {
            'vehicle.chassis.axle.row2.wheel.left.tire.pressure': {
              timestamp: '2025-10-21T06:16:44Z',
              value: 250,
              unit: 'kpa',
            },
          },
        })
      ),
      expectedError: undefined,
    },
    {
      description: 'Invalid StreamMessage schema (VIN)',
      topic: '187d32c4-6ce2-470f-9f3d-81ba54bcc4da/AAAA',
      payload: Buffer.from(
        JSON.stringify({
          vin: 'AAAA',
          entityId: '187d32c4-6ce2-470f-9f3d-81ba54bcc4da',
          topic: 'AAAA',
          timestamp: '2025-10-21T06:16:45.61Z',
          data: {
            'vehicle.chassis.axle.row2.wheel.left.tire.pressure': {
              timestamp: '2025-10-21T06:16:44Z',
              value: 250,
              unit: 'kpa',
            },
          },
        })
      ),
      expectedError: Error('Invalid StreamMessage schema'),
    },
  ];

  testCases.forEach(({ description, topic, payload, expectedError }) => {
    it(`should log and emit event for ${description}`, () => {
      const emitEventSpy = jest.spyOn(client as any, 'emitEvent').mockImplementation(jest.fn());

      (client as any).handleMessage(topic, payload);

      if (!expectedError) {
        expect(mockLogger.error).toHaveBeenCalledTimes(0);
        expect(emitEventSpy).toHaveBeenCalledWith('message', topic, expect.anything());
      } else {
        expect(mockLogger.error).toHaveBeenCalledWith('Invalid MQTT message', expectedError, {
          topic,
          payload: payload.toString(),
        });
        expect(emitEventSpy).toHaveBeenCalledWith('error', expectedError);
      }
    });
  });
});
