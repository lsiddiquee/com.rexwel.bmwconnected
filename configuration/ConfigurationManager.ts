import { Homey } from "homey";
import { Configuration } from "./Configuration";

export class ConfigurationManager {
    static readonly _settingsKey : string = 'com.rexwel.bmwconnected';

    static getConfiguration(homey : Homey): Configuration {
        return homey.settings.get(ConfigurationManager._settingsKey);
    }
    static setConfiguration(homey : Homey, value: Configuration) {
        homey.settings.set(ConfigurationManager._settingsKey, value);
    }
}