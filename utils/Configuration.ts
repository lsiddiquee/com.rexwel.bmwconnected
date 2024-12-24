import { LogLevel, Regions, Token } from "bmw-connected-drive";
import { LocationType } from "./LocationType";

export class Configuration {
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