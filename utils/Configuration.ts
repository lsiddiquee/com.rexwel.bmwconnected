import { LogLevel, Token } from "bmw-connected-drive";
import { LocationType } from "./LocationType";

export class Configuration {
    username!: string;
    password!: string;
    geofences?: LocationType[];
    logEnabled: boolean = false;
    logLevel: LogLevel = LogLevel.Warning;
    logRequestCount: number = 20;
    token!: Token;
}