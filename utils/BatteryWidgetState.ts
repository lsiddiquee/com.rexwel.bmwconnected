import type { VehicleStatus } from '../lib/models/VehicleStatus';
import { UnitConverter } from './UnitConverter';

/**
 * What the "Car battery" dashboard widget shows about the charging cable and the charging itself.
 *
 * - CHARGING: the car is plugged in and charging
 * - PLUGGED_IN: the car is plugged in and not charging (waiting, paused, complete, error)
 * - NOT_PLUGGED_IN: the cable is disconnected
 * - UNKNOWN: the car has not reported whether a cable is plugged in
 */
export type WidgetChargeState = 'CHARGING' | 'PLUGGED_IN' | 'NOT_PLUGGED_IN' | 'UNKNOWN';

/**
 * Everything the "Car battery" dashboard widget needs to draw itself, for one car.
 *
 * Handed to the widget by the widget API (`GET /state`) and pushed to it as the payload of the
 * {@link BATTERY_WIDGET_EVENT} realtime event.
 */
export interface BatteryWidgetState {
  /** The device's data id (the VIN) */
  deviceId: string;
  /** The car name: the device name without the VIN pairing appends to it */
  name: string;
  /** Battery level, an integer from 0 to 100. Undefined when the car has not reported one: that is not the same as empty (0). */
  percent?: number;
  charge: WidgetChargeState;
  /** Remaining range, rounded, in `rangeUnit`. Undefined when unknown. */
  range?: number;
  rangeUnit: 'km' | 'mi';
  /** When charging should finish (epoch ms). Only while CHARGING, and only while still in the future. */
  fullAt?: number;
  /** When the car measured the newest data (epoch ms) */
  updatedAt?: number;
}

/**
 * Name of the realtime event that carries a {@link BatteryWidgetState} to the widget.
 */
export const BATTERY_WIDGET_EVENT = 'battery-widget:update';

/**
 * How far `updatedAt` (and `fullAt`) must move from what the widget last received before it is
 * worth another realtime event on its own. Anything else that changes is sent straight away.
 */
export const BATTERY_WIDGET_REFRESH_INTERVAL_MS = 60 * 1000;

/**
 * Whether a value is a finite number
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Read the remaining range of the status in kilometers.
 *
 * The total range (`status.range`) wins. The electric range is the fallback: the transformer
 * writes 0 when the car reported none, so only a positive value counts there.
 */
function readRangeKm(status: VehicleStatus | undefined): number | undefined {
  if (!status) {
    return undefined;
  }
  if (isFiniteNumber(status.range) && status.range >= 0) {
    return status.range;
  }
  const electricRange = status.electric?.range;
  return isFiniteNumber(electricRange) && electricRange > 0 ? electricRange : undefined;
}

/**
 * Work out what the widget shows about the cable and the charging.
 *
 * Same precedence as the Homey charging state of the device: the cable decides first (a
 * disconnected cable is never charging, whatever the charging status says), then the charging
 * status, then the cable again.
 */
function readChargeState(status: VehicleStatus | undefined): WidgetChargeState {
  if (status?.chargingCable === 'DISCONNECTED') {
    return 'NOT_PLUGGED_IN';
  }
  if (status?.electric?.chargingStatus === 'CHARGING') {
    return 'CHARGING';
  }
  return status?.chargingCable === 'CONNECTED' ? 'PLUGGED_IN' : 'UNKNOWN';
}

/**
 * The car name to show on the widget: the device name without the VIN that pairing appends to it
 * ("iX3 M Sport (WBA12345678901234)" shows as "iX3 M Sport"). A name that is only the VIN, or that
 * the user changed to anything else, is shown as it is.
 *
 * @param name - The device name
 * @param vin - The car's VIN (the device's data id)
 */
function readCarName(name: string, vin: string): string {
  const suffix = ` (${vin})`;
  if (vin && name.endsWith(suffix)) {
    const shortName = name.slice(0, -suffix.length).trim();
    if (shortName) {
      return shortName;
    }
  }
  return name;
}

/**
 * Build the state of the "Car battery" widget from the vehicle status.
 *
 * Pure: it reads nothing but its input, so the same input gives the same state.
 *
 * @param input.deviceId - The device's data id
 * @param input.name - The device name (a trailing " (VIN)" is left out, see readCarName)
 * @param input.status - The newest vehicle status, undefined when there is none yet
 * @param input.distanceUnit - The device's distance unit setting ('metric' is km, anything else miles)
 * @param input.updatedAt - When the car measured the newest data (epoch ms), if known
 * @param input.now - The current time (epoch ms)
 * @returns The widget state
 */
export function buildBatteryWidgetState(input: {
  deviceId: string;
  name: string;
  status: VehicleStatus | undefined;
  distanceUnit: string;
  updatedAt: number | undefined;
  now: number;
}): BatteryWidgetState {
  const { status, distanceUnit, updatedAt, now } = input;

  const level = status?.electric?.chargeLevelPercent;
  const percent = isFiniteNumber(level) ? Math.min(100, Math.max(0, Math.round(level))) : undefined;

  const charge = readChargeState(status);

  const rangeKm = readRangeKm(status);
  const range =
    rangeKm === undefined
      ? undefined
      : Math.round(UnitConverter.ConvertDistance(rangeKm, distanceUnit));

  // The car says how long charging takes from the moment it measured that, not from now
  let fullAt: number | undefined;
  const minutes = status?.electric?.remainingChargingMinutes;
  if (
    charge === 'CHARGING' &&
    isFiniteNumber(minutes) &&
    minutes > 0 &&
    isFiniteNumber(updatedAt)
  ) {
    const finishesAt = updatedAt + minutes * 60 * 1000;
    fullAt = finishesAt > now ? finishesAt : undefined;
  }

  return {
    deviceId: input.deviceId,
    name: readCarName(input.name, input.deviceId),
    percent,
    charge,
    range,
    rangeUnit: distanceUnit === 'metric' ? 'km' : 'mi',
    fullAt,
    updatedAt,
  };
}

/**
 * Whether a state is different enough from the one the widget last received to push it again.
 *
 * The widget redraws itself on every event and counts the time since `updatedAt` on its own, so a
 * state is only pushed when:
 *
 * - nothing was pushed before, or
 * - something other than `updatedAt` and `fullAt` changed (compared as JSON), or
 * - `updatedAt` or `fullAt` moved by a minute or more (or appeared or disappeared).
 *
 * `fullAt` is compared with a tolerance because it is derived from `updatedAt`: it moves with every
 * message that carries a new measurement time, which would make every message during charging a
 * new event.
 *
 * @param previous - The state that was pushed last, undefined when none was
 * @param next - The state that is about to be pushed
 * @returns True when the state should be pushed
 */
export function shouldEmitBatteryWidgetState(
  previous: BatteryWidgetState | undefined,
  next: BatteryWidgetState
): boolean {
  if (!previous) {
    return true;
  }

  const withoutTimes = (state: BatteryWidgetState) =>
    JSON.stringify({ ...state, updatedAt: undefined, fullAt: undefined });
  if (withoutTimes(previous) !== withoutTimes(next)) {
    return true;
  }

  return timeMoved(previous.updatedAt, next.updatedAt) || timeMoved(previous.fullAt, next.fullAt);
}

/**
 * Whether a time moved by at least {@link BATTERY_WIDGET_REFRESH_INTERVAL_MS} in either direction
 * (backwards happens when the Homey clock steps back), or appeared or disappeared.
 */
function timeMoved(previous: number | undefined, next: number | undefined): boolean {
  if (previous === undefined || next === undefined) {
    return previous !== next;
  }
  return Math.abs(next - previous) >= BATTERY_WIDGET_REFRESH_INTERVAL_MS;
}
