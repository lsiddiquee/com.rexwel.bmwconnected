import type {
  CableStatus,
  ChargingStatus,
  ClimateActivity,
  LockStatus,
} from '../lib/models/VehicleStatus';
import { FlowId, Flows } from './Flows';

/**
 * The vehicle states that the lock, charging, charging cable, climate and battery flow cards watch.
 *
 * Every state has an explicit UNKNOWN value for "the car never told us (yet)", which is not the
 * same as unlocked, disconnected, not charging or inactive. The battery level is a number, so
 * there is no such value: `undefined` means that there is no reading, which is not the same as an
 * empty battery (0).
 */
export interface FlowStates {
  carLock: LockStatus;
  chargingFlap: LockStatus;
  chargingCable: CableStatus;
  climateActivity: ClimateActivity;
  chargingStatus: ChargingStatus;
  batteryLevel: number | undefined;
}

/**
 * The states when nothing is known yet.
 */
export const UNKNOWN_FLOW_STATES: Readonly<FlowStates> = Object.freeze({
  carLock: 'UNKNOWN',
  chargingFlap: 'UNKNOWN',
  chargingCable: 'UNKNOWN',
  climateActivity: 'UNKNOWN',
  chargingStatus: 'UNKNOWN',
  batteryLevel: undefined,
});

/**
 * English titles of the known climate activities, as passed in the `state` token of the
 * "Climate status changed" flow trigger.
 */
export const CLIMATE_ACTIVITY_TITLES: Record<Exclude<ClimateActivity, 'UNKNOWN'>, string> = {
  HEATING: 'Heating',
  COOLING: 'Cooling',
  VENTILATION: 'Ventilation',
  INACTIVE: 'Inactive',
};

/**
 * A flow trigger that has to fire, with the tokens to fire it with and, for a trigger card whose
 * run listener needs it, the state to hand to that listener.
 */
export interface PlannedTrigger {
  cardId: FlowId;
  tokens: Record<string, string | number>;
  state?: Record<string, string | number>;
}

const LOCK_STATUSES: readonly unknown[] = ['LOCKED', 'UNLOCKED', 'UNKNOWN'];
const CABLE_STATUSES: readonly unknown[] = ['CONNECTED', 'DISCONNECTED', 'UNKNOWN'];
const CLIMATE_ACTIVITIES: readonly unknown[] = [
  'HEATING',
  'COOLING',
  'VENTILATION',
  'INACTIVE',
  'UNKNOWN',
];
// INVALID is a legacy member of ChargingStatus that nothing produces: it is not a known status
const CHARGING_STATUSES: readonly unknown[] = [
  'CHARGING',
  'NOT_CHARGING',
  'COMPLETE',
  'PAUSED',
  'INITIALIZING',
  'ERROR',
  'UNKNOWN',
];

/**
 * What {@link readFlowStates} reads: a vehicle status, or anything shaped like one. Every field is
 * unknown on purpose, because the data may come from older versions of the app.
 */
export interface FlowStatesSource {
  carLock?: unknown;
  chargingFlap?: unknown;
  chargingCable?: unknown;
  climateActivity?: unknown;
  electric?: { chargingStatus?: unknown; chargeLevelPercent?: unknown } | null;
}

/**
 * Read the watched states from a vehicle status.
 *
 * Tolerates what the type does not: no status at all, a status restored from data written by an
 * older version of the app (which has none of the fields), or a field holding something that is
 * not a valid state. Each of those reads as UNKNOWN (no battery level for the battery) instead of
 * crashing, field by field. The charging status and the battery level come from the electric
 * state of the status.
 *
 * @param status - A vehicle status, or anything shaped like one
 * @returns The watched states; a new object on every call
 */
export function readFlowStates(status: FlowStatesSource | null | undefined): FlowStates {
  return {
    carLock: pick(status?.carLock, LOCK_STATUSES) as LockStatus,
    chargingFlap: pick(status?.chargingFlap, LOCK_STATUSES) as LockStatus,
    chargingCable: pick(status?.chargingCable, CABLE_STATUSES) as CableStatus,
    climateActivity: pick(status?.climateActivity, CLIMATE_ACTIVITIES) as ClimateActivity,
    chargingStatus: pick(status?.electric?.chargingStatus, CHARGING_STATUSES) as ChargingStatus,
    batteryLevel: pickNumber(status?.electric?.chargeLevelPercent),
  };
}

/**
 * Work out which flow triggers a change from the previous to the new states fires.
 *
 * A trigger fires only for a real transition between two known states (LOCKED and UNLOCKED,
 * CONNECTED and DISCONNECTED, two charging statuses, two climate activities, or two battery
 * levels). It never fires when there is no previous status (first value after startup or
 * pairing), or when the old or the new state is UNKNOWN (or the battery level unknown). Each state
 * is judged on its own, so one unknown state does not block the others.
 *
 * Charging status: every change between two known statuses fires "charging status changed" with
 * the new status.
 *
 * Battery: every change of the known battery level fires "battery level changed and is above",
 * with the new level as token and as state. It does not look at any percentage: each flow has its
 * own, which Homey compares with the state through the run listener of the card.
 *
 * Climate: INACTIVE to an active state fires "started", an active state to INACTIVE fires
 * "stopped", and every change between two known activities also fires "status changed" with the
 * English title of the new activity.
 *
 * @param previous - The states before this update, or undefined when there was no previous status
 * @param next - The states after this update
 * @returns The triggers to fire, in the order to fire them; empty when nothing has to fire
 */
export function planStateTriggers(
  previous: FlowStates | undefined,
  next: FlowStates
): PlannedTrigger[] {
  if (!previous) {
    return [];
  }

  const planned: PlannedTrigger[] = [];
  const add = (
    cardId: FlowId | undefined,
    tokens: PlannedTrigger['tokens'] = {},
    state?: PlannedTrigger['state']
  ) => {
    if (cardId) {
      planned.push(state ? { cardId, tokens, state } : { cardId, tokens });
    }
  };

  add(lockTrigger(previous.carLock, next.carLock, Flows.CAR_LOCKED, Flows.CAR_UNLOCKED));
  add(
    lockTrigger(
      previous.chargingFlap,
      next.chargingFlap,
      Flows.CHARGING_FLAP_LOCKED,
      Flows.CHARGING_FLAP_UNLOCKED
    )
  );
  add(cableTrigger(previous.chargingCable, next.chargingCable));

  if (
    previous.chargingStatus !== 'UNKNOWN' &&
    next.chargingStatus !== 'UNKNOWN' &&
    previous.chargingStatus !== next.chargingStatus
  ) {
    add(Flows.CHARGING_STATUS_CHANGE, { charging_status: next.chargingStatus });
  }

  const before = previous.climateActivity;
  const after = next.climateActivity;
  if (before !== 'UNKNOWN' && after !== 'UNKNOWN' && before !== after) {
    if (before === 'INACTIVE') {
      add(Flows.CLIMATE_NOW_STARTED);
    } else if (after === 'INACTIVE') {
      add(Flows.CLIMATE_NOW_STOPPED);
    }
    add(Flows.CLIMATE_STATUS_CHANGED, { state: CLIMATE_ACTIVITY_TITLES[after] });
  }

  const levelBefore = previous.batteryLevel;
  const levelAfter = next.batteryLevel;
  if (levelBefore !== undefined && levelAfter !== undefined && levelBefore !== levelAfter) {
    add(Flows.BATTERY_LEVEL_ABOVE, { battery: levelAfter }, { level: levelAfter });
  }

  return planned;
}

/**
 * Return the value when it is one of the allowed states, otherwise UNKNOWN.
 */
function pick(value: unknown, allowed: readonly unknown[]): unknown {
  return allowed.includes(value) ? value : 'UNKNOWN';
}

/**
 * Return the value when it is a finite number (0 is a valid reading), otherwise undefined.
 */
function pickNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Pick the trigger for a change between two known lock states.
 */
function lockTrigger(
  previous: LockStatus,
  next: LockStatus,
  locked: FlowId,
  unlocked: FlowId
): FlowId | undefined {
  if (previous === 'UNKNOWN' || next === 'UNKNOWN' || previous === next) {
    return undefined;
  }
  return next === 'LOCKED' ? locked : unlocked;
}

/**
 * Pick the trigger for a change between the two known charging cable states.
 */
function cableTrigger(previous: CableStatus, next: CableStatus): FlowId | undefined {
  if (previous === 'UNKNOWN' || next === 'UNKNOWN' || previous === next) {
    return undefined;
  }
  return next === 'CONNECTED' ? Flows.CHARGING_CABLE_CONNECTED : Flows.CHARGING_CABLE_DISCONNECTED;
}
