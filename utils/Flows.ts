export const Flows = {
  // Device trigger cards
  CHARGING_STATUS_CHANGE: 'charging_status_change',
  REFUELLED: 'refuelled',
  DRIVE_SESSION_STARTED: 'drive_session_started',
  DRIVE_SESSION_COMPLETED: 'drive_session_completed',
  LOCATION_CHANGED: 'location_changed',
  GEO_FENCE_ENTER: 'geo_fence_enter',
  GEO_FENCE_EXIT: 'geo_fence_exit',

  // Condition cards
  GEOFENCE_CONDITION: 'geofence',
  BATTERY_PERCENTAGE_CONDITION: 'battery_percentage',
  CHARGING_STATUS_CONDITION: 'charging_status',
} as const;

export type FlowId = (typeof Flows)[keyof typeof Flows];
