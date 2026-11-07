/**
 * DeviceStateManager cache coherence tests.
 *
 * Validates timestamp-based merging to ensure newer data always wins and
 * partial updates never wipe unrelated cache entries.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type Homey from 'homey';
import {
  DeviceStateManager,
  type DeviceStoreData,
  type StateUpdateDelegate,
} from '../../utils/DeviceStateManager';
import type { ILogger } from '../../lib/types/ILogger';
import type { StreamMessage } from '../../lib/streaming';
import { DriveTrainType } from '../../lib/types/DriveTrainType';
import { STORE_KEY_DEVICE_STATE } from '../../utils/StoreKeys';

describe('DeviceStateManager - cache coherence', () => {
  let mockDevice: jest.Mocked<Homey.Device>;
  let mockLogger: jest.Mocked<ILogger>;
  let stateUpdateDelegate: jest.MockedFunction<StateUpdateDelegate>;
  let mockStore: Record<string, unknown>;
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
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
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

  const getStore = () => mockStore[STORE_KEY_DEVICE_STATE] as DeviceStoreData;

  it('preserves newer API value when stale MQTT data arrives later', async () => {
    await manager.updateFromApi({
      'vehicleStatus.mileage': {
        timestamp: '2025-10-29T10:05:00.000Z',
        value: 45001,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    jest.useFakeTimers();

    const mqttMessage: StreamMessage = {
      vin: 'VIN123',
      entityId: 'mqtt-1',
      topic: 'VIN123',
      timestamp: '2025-10-29T10:06:00.000Z',
      data: {
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:00:00.000Z',
          value: 44000,
          unit: 'KILOMETERS',
          source: 'mqtt' as const,
        },
      },
    };

    manager.updateFromMqttMessage(mqttMessage);
    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    const store = getStore();
    expect(store.telematicCache['vehicleStatus.mileage'].value).toBe(45001);
  });

  it('retains existing electric data when API returns partial payload', async () => {
    await manager.updateFromApi({
      'vehicleStatus.electricChargingState.chargeLevelPercent': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 80,
        unit: 'PERCENT',
        source: 'api' as const,
      },
      'vehicleStatus.electricChargingState.range': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 220,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
      'vehicleStatus.electricChargingState.chargingStatus': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 'CHARGING',
        source: 'api' as const,
      },
    });

    await manager.updateFromApi({
      'vehicleStatus.electricChargingState.chargeLevelPercent': {
        timestamp: '2025-10-29T10:05:00.000Z',
        value: 75,
        unit: 'PERCENT',
        source: 'api' as const,
      },
    });

    const store = getStore();
    expect(store.telematicCache['vehicleStatus.electricChargingState.range'].value).toBe(220);
    expect(store.telematicCache['vehicleStatus.electricChargingState.chargingStatus'].value).toBe(
      'CHARGING'
    );
    expect(
      store.telematicCache['vehicleStatus.electricChargingState.chargeLevelPercent'].value
    ).toBe(75);
  });

  it('merges API and MQTT updates targeting different keys', async () => {
    await manager.updateFromApi({
      'vehicleStatus.mileage': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 15000,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    jest.useFakeTimers();

    const mqttMessage: StreamMessage = {
      vin: 'VIN123',
      entityId: 'mqtt-2',
      topic: 'VIN123',
      timestamp: '2025-10-29T10:01:00.000Z',
      data: {
        'vehicleStatus.location.coordinates.latitude': {
          timestamp: '2025-10-29T10:01:00.000Z',
          value: 52.1234,
          source: 'mqtt' as const,
        },
        'vehicleStatus.location.coordinates.longitude': {
          timestamp: '2025-10-29T10:01:00.000Z',
          value: 4.5678,
          source: 'mqtt' as const,
        },
      },
    };

    manager.updateFromMqttMessage(mqttMessage);
    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    const store = getStore();
    expect(store.telematicCache['vehicleStatus.mileage'].value).toBe(15000);
    expect(store.telematicCache['vehicleStatus.location.coordinates.latitude'].value).toBe(52.1234);
    expect(store.telematicCache['vehicleStatus.location.coordinates.longitude'].value).toBe(4.5678);
  });

  it('prefers more recent MQTT data over stale API cache', async () => {
    await manager.updateFromApi({
      'vehicleStatus.range': {
        timestamp: '2025-10-29T09:55:00.000Z',
        value: 300,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    jest.useFakeTimers();

    const mqttMessage: StreamMessage = {
      vin: 'VIN123',
      entityId: 'mqtt-3',
      topic: 'VIN123',
      timestamp: '2025-10-29T10:10:00.000Z',
      data: {
        'vehicleStatus.range': {
          timestamp: '2025-10-29T10:10:00.000Z',
          value: 320,
          unit: 'KILOMETERS',
          source: 'mqtt' as const,
        },
      },
    };

    manager.updateFromMqttMessage(mqttMessage);
    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    const store = getStore();
    expect(store.telematicCache['vehicleStatus.range'].value).toBe(320);
  });

  it('replaces value when timestamps are identical', async () => {
    await manager.updateFromApi({
      'vehicleStatus.mileage': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 15000,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    await manager.updateFromApi({
      'vehicleStatus.mileage': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 15005,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    const store = getStore();
    expect(store.telematicCache['vehicleStatus.mileage'].value).toBe(15005);
  });

  it('accepts future-dated data points to cope with clock skew', async () => {
    await manager.updateFromApi({
      'vehicleStatus.mileage': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 15000,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    jest.useFakeTimers();

    const mqttMessage: StreamMessage = {
      vin: 'VIN123',
      entityId: 'mqtt-4',
      topic: 'VIN123',
      timestamp: '2025-10-29T10:05:00.000Z',
      data: {
        'vehicleStatus.mileage': {
          timestamp: '2025-10-29T10:05:00.000Z',
          value: 15002,
          unit: 'KILOMETERS',
          source: 'mqtt' as const,
        },
      },
    };

    manager.updateFromMqttMessage(mqttMessage);
    jest.advanceTimersByTime(1000);
    await jest.runAllTimersAsync();

    const store = getStore();
    expect(store.telematicCache['vehicleStatus.mileage'].value).toBe(15002);
  });

  it('keeps cache untouched when API payload is empty', async () => {
    await manager.updateFromApi({
      'vehicleStatus.mileage': {
        timestamp: '2025-10-29T10:00:00.000Z',
        value: 15000,
        unit: 'KILOMETERS',
        source: 'api' as const,
      },
    });

    const before = JSON.parse(JSON.stringify(getStore().telematicCache));

    await manager.updateFromApi({});

    const after = getStore().telematicCache;
    expect(after).toEqual(before);
  });

  describe('lock, charging cable and climate states', () => {
    const point = (value: string | boolean, timestamp: string) => ({
      timestamp,
      value,
      source: 'api' as const,
    });

    it('keeps the last known states when a later update lacks their keys', async () => {
      await manager.updateFromApi({
        'vehicle.cabin.door.status': point('UNLOCKED', '2026-11-04T10:00:00.000Z'),
        'vehicle.body.flap.isLocked': point(true, '2026-11-04T10:00:00.000Z'),
        'vehicle.body.chargingPort.status': point('CONNECTED', '2026-11-04T10:00:00.000Z'),
        'vehicle.vehicle.preConditioning.activity': point('HEATING', '2026-11-04T10:00:00.000Z'),
      });

      // A later update that only carries something else
      const status = await manager.updateFromApi({
        'vehicle.vehicle.travelledDistance': point('15000', '2026-11-04T10:05:00.000Z'),
      });

      expect(status.carLock).toBe('UNLOCKED');
      expect(status.chargingFlap).toBe('LOCKED');
      expect(status.chargingCable).toBe('CONNECTED');
      expect(status.climateActivity).toBe('HEATING');
      expect(stateUpdateDelegate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          carLock: 'UNLOCKED',
          chargingFlap: 'LOCKED',
          chargingCable: 'CONNECTED',
          climateActivity: 'HEATING',
        })
      );
    });

    it('reads every state as UNKNOWN from a cache persisted before these keys were used', () => {
      mockStore[STORE_KEY_DEVICE_STATE] = {
        telematicCache: {
          'vehicle.vehicle.travelledDistance': point('15000', '2026-10-01T10:00:00.000Z'),
        },
        vin: 'VIN123',
        driveTrain: DriveTrainType.ELECTRIC,
      } satisfies DeviceStoreData;
      const restored = new DeviceStateManager(
        mockDevice,
        'VIN123',
        stateUpdateDelegate,
        mockLogger
      );

      const status = restored.getVehicleStatus();

      expect(status.carLock).toBe('UNKNOWN');
      expect(status.chargingFlap).toBe('UNKNOWN');
      expect(status.chargingCable).toBe('UNKNOWN');
      expect(status.climateActivity).toBe('UNKNOWN');
    });

    it('reads every state as UNKNOWN for a new device without any data', () => {
      const status = manager.getVehicleStatus();

      expect(status.carLock).toBe('UNKNOWN');
      expect(status.chargingFlap).toBe('UNKNOWN');
      expect(status.chargingCable).toBe('UNKNOWN');
      expect(status.climateActivity).toBe('UNKNOWN');
    });

    it('reports unexpected values at debug level through its logger', async () => {
      await manager.updateFromApi({
        'vehicle.cabin.door.status': point('AJAR', '2026-11-04T10:00:00.000Z'),
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('car lock'),
        expect.objectContaining({ value: 'AJAR' })
      );
    });
  });

  it('updates drive train when explicitly set', async () => {
    await manager.setDriveTrain(DriveTrainType.PLUGIN_HYBRID);
    const store = getStore();
    expect(store.driveTrain).toBe(DriveTrainType.PLUGIN_HYBRID);
  });
});
