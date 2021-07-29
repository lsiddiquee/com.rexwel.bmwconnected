import { Homey } from "homey";
import { Configuration } from "./Configuration";

export class ConfigurationManager {
    static readonly _settingsKey: string = 'com.rexwel.bmwconnected';
    static configurationCache: Configuration;

    static getConfiguration(homey: Homey): Configuration {
        if (!this.configurationCache) {
            this.configurationCache = homey.settings.get(ConfigurationManager._settingsKey);
        }
        if (!this.configurationCache.geofences) {
            this.configurationCache.geofences = [];
        }
        return this.configurationCache;
    }
    static setConfiguration(homey: Homey, value: Configuration) {
        if (!value.token) {
            // Token value is empty, most likely configuration is being saved from the app, hence, copying the old token.
            value.token = this.configurationCache?.token;
        }
        this.configurationCache = value;
        homey.settings.set(ConfigurationManager._settingsKey, value);
    }
}