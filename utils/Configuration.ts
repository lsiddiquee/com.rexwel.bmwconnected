import { LogLevel } from '../lib';
import { LocationType } from './LocationType';

/**
 * Application-level configuration settings
 *
 * Note: Per-device settings (clientId, containerId, tokens) are now stored
 * in device settings via DeviceSettings interface, not here.
 */
export class Configuration {
  currentVersion: string = '0.0.0';
  geofences: LocationType[] = [];
  logEnabled: boolean = false;
  logLevel: LogLevel = LogLevel.WARN;
  logRequestCount: number = 20;
  lokiUrl?: string;
}
