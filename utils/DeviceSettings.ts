export class DeviceSettings {
  refuellingTriggerThreshold: number = 5;
  distanceUnit: string = 'metric';
  fuelUnit: string = 'liter';
  autoRetry: boolean = false;

  // Distance in meters traveled before a location update is triggered
  locationUpdateThreshold: number = 50;

  currentVersion: string = '0.0.0';

  /**
   * Enable MQTT streaming for real-time updates
   * Default: true
   */
  streamingEnabled: boolean = true;

  /**
   * Enable API polling (can be used alongside MQTT or independently)
   * Default: true
   */
  apiPollingEnabled: boolean = true;

  /**
   * API polling interval in minutes
   * Default: 30 minutes (48 calls/day, well under 50/day limit)
   * Minimum: 30 minutes (to respect rate limits)
   */
  apiPollingInterval: number = 30;
}
