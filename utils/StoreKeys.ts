/**
 * Device Store Keys
 *
 * Centralized constants for all device store keys used throughout the application.
 * This prevents typos and makes refactoring easier.
 */

/**
 * Main device state cache (telematic data, VIN, drive train, etc.)
 */
export const STORE_KEY_DEVICE_STATE = 'deviceState';

/**
 * Last trip completion location (where previous trip ended, used as next trip start)
 */
export const STORE_KEY_LAST_TRIP_COMPLETE_LOCATION = 'lastTripCompleteLocation';

/**
 * Last trip completion mileage (where previous trip ended, used as next trip start)
 */
export const STORE_KEY_LAST_TRIP_COMPLETE_MILEAGE = 'lastTripCompleteMileage';

/**
 * Last known location with geofence info (Homey LocationType format)
 */
export const STORE_KEY_LAST_LOCATION = 'lastLocation';

/**
 * Client ID for BMW CarData API authentication
 */
export const STORE_KEY_CLIENT_ID = 'clientId';

/**
 * Container ID for telematic data access
 */
export const STORE_KEY_CONTAINER_ID = 'containerId';
