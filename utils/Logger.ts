import { LoggerBase, LogLevel } from "bmw-connected-drive";
import { Homey } from "homey";
import { ConfigurationManager } from "./ConfigurationManager";

export class Logger extends LoggerBase {
    homey: Homey;
    logCount: number = 0;
    logs: string[] = [];

    constructor(homey: Homey) {
        super();
        this.homey = homey;
    }

    Log(level: LogLevel, message: string): void {
        const configuration = ConfigurationManager.getConfiguration(this.homey);
        if (level < configuration.logLevel && level < LogLevel.Error) return;
        const logMessage = `[${new Date().toISOString()}] ${LogLevel[level]}: ${message}`;
        this.homey.log(logMessage);
        if (configuration.logEnabled || level >= LogLevel.Error) {
            this.logs[this.logCount] = logMessage;
            this.logCount = (this.logCount + 1) % configuration.logRequestCount;
        }
    }

    LogError(err: any): void {
        if (typeof err === "string") {
            this.Log(LogLevel.Error, err);
        } else if (err instanceof Error) {
            this.Log(LogLevel.Error, err.message);
        } else {
            this.Log(LogLevel.Error, String(err));
        }
    }
}