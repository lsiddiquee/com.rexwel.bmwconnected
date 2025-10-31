/**
 * DeviceStateManager comprehensive behaviour tests.
 *
 * Focus on:
 * 1. Store seeding during construction.
 * 2. MQTT batching behaviour.
 * 3. API cache updates.
 * 4. Cache clearing.
 * 5. Persistence helpers for trip/location, client/container ids, drive train.
 * 6. Delegate error handling.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type Homey from 'homey';
import { DeviceStateManager, type StateUpdateDelegate } from '../../utils/DeviceStateManager';
import type { ILogger } from '../../lib/types/ILogger';
import type { StreamMessage } from '../../lib/streaming';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import {
  STORE_KEY_CLIENT_ID,
  STORE_KEY_CONTAINER_ID,
  STORE_KEY_DEVICE_STATE,
} from '../../utils/StoreKeys';

describe('DeviceStateManager - comprehensive behaviour', () => {
  let mockDevice: jest.Mocked<Homey.Device>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockStore: Record<string, unknown>;
  let stateUpdateDelegate: jest.MockedFunction<StateUpdateDelegate>;
  let manager: DeviceStateManager;

  beforeEach(() => {
    mockStore = {};

    mockDevice = {
      getStoreValue: jest
        .fn<(key: string) => unknown>()
        .mockImplementation((key) => mockStore[key]),
      setStoreValue: jest
        .fn<(key: string, value: unknown) => Promise<void>>()
        .mockImplementation(async (key, value) => {
          mockStore[key] = JSON.parse(JSON.stringify(value));
        }),
      getSettings: jest.fn().mockReturnValue({ streamingEnabled: true }),
    } as unknown as jest.Mocked<Homey.Device>;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as unknown as jest.Mocked<ILogger>;

    stateUpdateDelegate = jest.fn<StateUpdateDelegate>().mockImplementation(async () => {
      // Default delegate is async to mirror production usage
    });

    manager = new DeviceStateManager(mockDevice, 'VIN123', stateUpdateDelegate, mockLogger);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('seeds store snapshot during construction', () => {
    const seeded = mockStore[STORE_KEY_DEVICE_STATE] as {
      vin: string;
      driveTrain: DriveTrainType;
      telematicCache: Record<string, unknown>;
    };

    expect(seeded).toBeDefined();
    expect(seeded.vin).toBe('VIN123');
    expect(seeded.driveTrain).toBe(DriveTrainType.UNKNOWN);
    expect(seeded.telematicCache).toEqual({});
  });

  it('batches mqtt messages within one second and calls delegate once', async () => {
    jest.useFakeTimers();

    const firstMessage: StreamMessage = {
      vin: 'VIN123',
      entityId: 'entity-1',
      topic: 'VIN123',
      timestamp: '2025-01-01T10:00:00Z',
      data: {
        'vehicleStatus.mileage': {
          timestamp: '2025-01-01T10:00:00Z',
          value: 12345,
          unit: 'KILOMETERS',
          source: 'mqtt',
        },
      },
    };

    const secondMessage: StreamMessage = {
      vin: 'VIN123',
      entityId: 'entity-2',
      topic: 'VIN123',
      timestamp: '2025-01-01T10:00:01Z',
      data: {
        'vehicleStatus.chargingStatus': {
          timestamp: '2025-01-01T10:00:01Z',
          value: 'CHARGING',
          source: 'mqtt',
        },
      },
    };

    manager.updateFromMqttMessage(firstMessage);
    manager.updateFromMqttMessage(secondMessage);

    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    const storeData = mockStore[STORE_KEY_DEVICE_STATE] as {
      telematicCache: Record<string, unknown>;
      lastMqttUpdate?: string;
    };

    expect(storeData.telematicCache['vehicleStatus.mileage']).toBeDefined();
    expect(storeData.telematicCache['vehicleStatus.chargingStatus']).toBeDefined();
    expect(storeData.lastMqttUpdate).toBeDefined();
    expect(stateUpdateDelegate).toHaveBeenCalledTimes(1);
  });

  it('updates cache when api telematic data provided', async () => {
    const apiData = {
      'vehicleStatus.fuelLevel': {
        timestamp: '2025-01-01T11:00:00Z',
        value: 80,
        unit: 'PERCENT',
        source: 'api' as const,
      },
    };

    await manager.updateFromApi(apiData);

    const storeData = mockStore[STORE_KEY_DEVICE_STATE] as {
      telematicCache: Record<string, unknown>;
      lastApiUpdate?: string;
    };

    expect(storeData.telematicCache['vehicleStatus.fuelLevel']).toBeDefined();
    expect(storeData.lastApiUpdate).toBeDefined();
    expect(stateUpdateDelegate).toHaveBeenCalledTimes(1);
  });

  it('clears cache but preserves vin and drive train', async () => {
    const storeData = mockStore[STORE_KEY_DEVICE_STATE] as {
      telematicCache: Record<string, unknown>;
      vin: string;
      driveTrain: DriveTrainType;
    };
    storeData.telematicCache = {
      'vehicleStatus.range': {
        timestamp: '2025-01-01T11:00:00Z',
        value: 200,
        unit: 'KILOMETERS',
        source: 'api',
      },
    };
    storeData.driveTrain = DriveTrainType.PLUGIN_HYBRID;

    await manager.clearCache();

    const cleared = mockStore[STORE_KEY_DEVICE_STATE] as typeof storeData;
    expect(cleared.vin).toBe('VIN123');
    expect(cleared.driveTrain).toBe(DriveTrainType.PLUGIN_HYBRID);
    expect(cleared.telematicCache).toEqual({});
  });

  it('persists and retrieves trip completion location and mileage', async () => {
    const location = { label: 'Home', latitude: 52.0, longitude: 4.0, address: '' };
    await manager.setLastTripCompleteLocation(location);
    await manager.setLastTripCompleteMileage(12345);

    expect(manager.getLastTripCompleteLocation()).toEqual(location);
    expect(manager.getLastTripCompleteMileage()).toBe(12345);
  });

  it('persists and retrieves last known location', async () => {
    const location = { label: 'Work', latitude: 51.5, longitude: 5.0, address: '' };
    await manager.setLastLocation(location);

    expect(manager.getLastLocation()).toEqual(location);
  });

  it('persists client and container identifiers', async () => {
    await manager.setClientId('client-123');
    await manager.setContainerId('container-456');

    expect(manager.getClientId()).toBe('client-123');
    expect(manager.getContainerId()).toBe('container-456');
    expect(mockDevice.setStoreValue).toHaveBeenCalledWith(STORE_KEY_CLIENT_ID, 'client-123');
    expect(mockDevice.setStoreValue).toHaveBeenCalledWith(STORE_KEY_CONTAINER_ID, 'container-456');
  });

  it('updates drive train value in store', async () => {
    await manager.setDriveTrain(DriveTrainType.ELECTRIC);

    expect(manager.getDriveTrain()).toBe(DriveTrainType.ELECTRIC);
    const storeData = mockStore[STORE_KEY_DEVICE_STATE] as { driveTrain: DriveTrainType };
    expect(storeData.driveTrain).toBe(DriveTrainType.ELECTRIC);
  });

  it('logs warning when delegate rejects during mqtt flush', async () => {
    jest.useFakeTimers();
    stateUpdateDelegate.mockImplementationOnce(async () => {
      throw new Error('delegate failed');
    });

    const message: StreamMessage = {
      vin: 'VIN123',
      entityId: 'entity-1',
      topic: 'VIN123',
      timestamp: '2025-01-01T10:00:00Z',
      data: {
        'vehicleStatus.mileage': {
          timestamp: '2025-01-01T10:00:00Z',
          value: 12345,
          unit: 'KILOMETERS',
          source: 'mqtt' as const,
        },
      },
    };

    manager.updateFromMqttMessage(message);
    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    expect(mockLogger.warn).toHaveBeenCalledWith('State update delegate threw error', {
      error: expect.any(Error),
    });
  });
});
