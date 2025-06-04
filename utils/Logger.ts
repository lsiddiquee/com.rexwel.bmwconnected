import { LoggerBase, LogLevel } from "bmw-connected-drive";
import { SimpleClass } from "homey";

export class Logger extends LoggerBase {
    logger: SimpleClass;
    getLogLevel: () => LogLevel;
    logs: string[] = [];

    constructor(logger: SimpleClass, getLogLevel: () => LogLevel) {
        super();
        this.logger = logger;
        this.getLogLevel = getLogLevel;
    }

    Log(level: LogLevel, message: string): void {
        const logLevel = this.getLogLevel();
        if (level < logLevel && level < LogLevel.Error) return;
        if (level === LogLevel.Error) this.logger.error(message);
        else this.logger.log(`${LogLevel[level]}: ${message}`);
        if (logLevel || level >= LogLevel.Error) {
            if (this.logs.length === 50) {
                this.logs.shift();
            }
            this.logs.push(`[${new Date().toISOString()}] ${LogLevel[level]}: ${message}`);
        }
    }

    LogError(err: any): void {
        const message = err instanceof Error ? err.message : String(err);
        this.Log(LogLevel.Error, message);
    }
}