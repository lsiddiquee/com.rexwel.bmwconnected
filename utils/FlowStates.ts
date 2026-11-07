import type { CableStatus, ClimateActivity, LockStatus } from '../lib/models/VehicleStatus';
import { FlowId, Flows } from './Flows';

/**
 * The vehicle states that the lock, charging cable and climate flow cards watch.
 *
 * Every state has an explicit UNKNOWN value for "the car never told us (yet)", which is not the
 * same as unlocked, disconnected or inactive. No state is ever optional.
 */
export interface FlowStates {
  carLock: LockStatus;
  chargingFlap: LockStatus;
  chargingCable: CableStatus;
  climateActivity: ClimateActivity;
}

/**
 * The states when nothing is known yet.
 */
export const UNKNOWN_FLOW_STATES: Readonly<FlowStates> = Object.freeze({
  carLock: 'UNKNOWN',
  chargingFlap: 'UNKNOWN',
  chargingCable: 'UNKNOWN',
  climateActivity: 'UNKNOWN',
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
 * A flow trigger that has to fire, with the tokens to fire it with.
 */
export interface PlannedTrigger {
  cardId: FlowId;
  tokens: Record<string, string>;
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

/**
 * Read the watched states from a vehicle status.
 *
 * Tolerates what the type does not: no status at all, a status restored from data written by an
 * older version of the app (which has none of the fields), or a field holding something that is
 * not a valid state. Each of those reads as UNKNOWN instead of crashing, field by field.
 *
 * @param status - A vehicle status, or anything shaped like one
 * @returns The watched states; a new object on every call
 */
export function readFlowStates(
  status: Partial<Record<keyof FlowStates, unknown>> | null | undefined
): FlowStates {
  return {
    carLock: pick(status?.carLock, LOCK_STATUSES) as LockStatus,
    chargingFlap: pick(status?.chargingFlap, LOCK_STATUSES) as LockStatus,
    chargingCable: pick(status?.chargingCable, CABLE_STATUSES) as CableStatus,
    climateActivity: pick(status?.climateActivity, CLIMATE_ACTIVITIES) as ClimateActivity,
  };
}

/**
 * Work out which flow triggers a change from the previous to the new states fires.
 *
 * A trigger fires only for a real transition between two known states (LOCKED and UNLOCKED,
 * CONNECTED and DISCONNECTED, or two climate activities). It never fires when there is no
 * previous status (first value after startup or pairing), or when the old or the new state is
 * UNKNOWN. Each state is judged on its own, so one unknown state does not block the others.
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
  const add = (cardId: FlowId | undefined, tokens: Record<string, string> = {}) => {
    if (cardId) {
      planned.push({ cardId, tokens });
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

  return planned;
}

/**
 * Return the value when it is one of the allowed states, otherwise UNKNOWN.
 */
function pick(value: unknown, allowed: readonly unknown[]): unknown {
  return allowed.includes(value) ? value : 'UNKNOWN';
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
