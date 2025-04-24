import { LogLevel, Regions, Token } from "bmw-connected-drive";
import { LocationType } from "./LocationType";

export class Configuration {
    currentVersion: string = "0.0.0";
    username: string = "";
    password: string = "";
    captcha?: string;
    region: Regions = Regions.RestOfWorld;
    geofences: LocationType[] = [];
    logEnabled: boolean = false;
    logLevel: LogLevel = LogLevel.Warning;
    logRequestCount: number = 20;
    token?: Token;
}