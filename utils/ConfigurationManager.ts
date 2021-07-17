import { Homey } from "homey";
import { Configuration } from "./Configuration";

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
        value.token = this.configurationCache?.token;
        this.configurationCache = value;
        homey.settings.set(ConfigurationManager._settingsKey, value);
    }
}