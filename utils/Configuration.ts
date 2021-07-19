import { LogLevel, Token } from "bmw-connected-drive";

export class Configuration {
    username!: string;
    password!: string;
    geofences?: {
        label: string,
        latitude: number,
        longitude: number,
        address: string
    }[];
    logEnabled: boolean = false;
    logLevel: LogLevel = LogLevel.Warning;
    logRequestCount: number = 20;
    token!: Token;
}