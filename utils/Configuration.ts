import { LogLevel, Token } from "bmw-connected-drive";

export class Configuration {
    username!: string;
    password!: string;
    geofences?: {
        latitude: number,
        longitude: number,
        radius: number,
        address: string
    }[];
    logEnabled: boolean = false;
    logLevel: LogLevel = LogLevel.Warning;
    logRequestCount: number = 20;
    token!: Token;
}