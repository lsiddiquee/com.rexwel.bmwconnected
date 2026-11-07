export const Flows = {
  // Device trigger cards
  CHARGING_STATUS_CHANGE: 'charging_status_change',
  REFUELLED: 'refuelled',
  DRIVE_SESSION_STARTED: 'drive_session_started',
  DRIVE_SESSION_COMPLETED: 'drive_session_completed',
  LOCATION_CHANGED: 'location_changed',
  GEO_FENCE_ENTER: 'geo_fence_enter',
  GEO_FENCE_EXIT: 'geo_fence_exit',
  STREAM_STATE_CHANGED: 'stream_state_changed',

  // Condition cards
  GEOFENCE_CONDITION: 'geofence',
  BATTERY_PERCENTAGE_CONDITION: 'battery_percentage',
  CHARGING_STATUS_CONDITION: 'charging_status',
  CAR_DATA_FRESH_CONDITION: 'car_data_fresh',
  CAR_DATA_STREAM_LIVE_CONDITION: 'car_data_stream_live',
} as const;

export type FlowId = (typeof Flows)[keyof typeof Flows];
