import Homey from 'homey/lib/Homey';
import { Configuration } from './Configuration';

export class ConfigurationManager {
  static readonly _settingsKey: string = 'com.rexwel.bmwconnected';
  static configurationCache: Configuration;

  static getConfiguration(homey: Homey): Configuration {
    if (!this.configurationCache) {
      this.configurationCache = homey.settings.get(ConfigurationManager._settingsKey);
    }
    return this.configurationCache;
  }
  static setConfiguration(homey: Homey, value: Configuration) {
    // Note: Tokens and client ID are now stored per-device, not in Configuration
    this.configurationCache = value;
    homey.settings.set(ConfigurationManager._settingsKey, value);
  }
}
