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
  CAR_LOCKED: 'car_locked',
  CAR_UNLOCKED: 'car_unlocked',
  CHARGING_FLAP_LOCKED: 'charging_flap_locked',
  CHARGING_FLAP_UNLOCKED: 'charging_flap_unlocked',
  CHARGING_CABLE_CONNECTED: 'charging_cable_connected',
  CHARGING_CABLE_DISCONNECTED: 'charging_cable_disconnected',
  CLIMATE_NOW_STARTED: 'climate_now_started',
  CLIMATE_NOW_STOPPED: 'climate_now_stopped',
  CLIMATE_STATUS_CHANGED: 'climate_status_changed',

  // Condition cards
  GEOFENCE_CONDITION: 'geofence',
  BATTERY_PERCENTAGE_CONDITION: 'battery_percentage',
  CHARGING_STATUS_CONDITION: 'charging_status',
  CAR_DATA_FRESH_CONDITION: 'car_data_fresh',
  CAR_DATA_STREAM_LIVE_CONDITION: 'car_data_stream_live',
  CAR_IS_LOCKED_CONDITION: 'car_is_locked',
  CHARGING_CABLE_IS_CONNECTED_CONDITION: 'charging_cable_is_connected',
} as const;

export type FlowId = (typeof Flows)[keyof typeof Flows];
