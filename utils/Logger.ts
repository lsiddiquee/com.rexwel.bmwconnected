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
        if (level < configuration.logLevel) return;
        const logMessage = `[${new Date().toISOString()}] ${LogLevel[level]}: ${message}`;
        this.homey.log(logMessage);
        if (configuration.logEnabled) {
            this.logs[this.logCount] = logMessage;
            this.logCount = (this.logCount + 1) % (configuration.logRequestCount ?? 10);
        }
    }
}