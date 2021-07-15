import { LogLevel, Token } from "bmw-connected-drive";

export class Configuration {
    username!: string;
    password!: string;
    token!: Token;
    logEnabled: boolean = false;
    logLevel: LogLevel = LogLevel.Warning;
    logRequestCount: number = 20;
}