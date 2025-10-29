import { SimpleClass } from 'homey';
import { ILogger, LogContext, LogLevel } from '../lib';

/**
 * Logger implementation for Homey app
 * Implements the ILogger interface to provide logging functionality
 */
export class Logger implements ILogger {
  logger: SimpleClass;
  getLogLevel: () => LogLevel;
  logs: string[] = [];

  constructor(logger: SimpleClass, getLogLevel: () => LogLevel) {
    this.logger = logger;
    this.getLogLevel = getLogLevel;
  }
  log(level: LogLevel, message: string, context?: LogContext): void {
    this.logInternal(level, `${message} ${context ? JSON.stringify(context) : ''}`);
  }
  trace(message: string, context?: LogContext): void {
    this.log(LogLevel.TRACE, message, context);
  }
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }
  error(message: string, _error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }
  fatal(message: string, _error?: Error, context?: LogContext): void {
    this.log(LogLevel.FATAL, message, context);
  }
  setLevel(_level: LogLevel): void {
    throw new Error('Method not implemented.');
  }
  getLevel(): LogLevel {
    throw new Error('Method not implemented.');
  }

  private logInternal(level: LogLevel, message: string): void {
    const logLevel = this.getLogLevel();
    if (level < logLevel && level < LogLevel.ERROR) return;
    if (level === LogLevel.ERROR) this.logger.error(message);
    else this.logger.log(`${LogLevel[level]}: ${message}`);
    if (logLevel || level >= LogLevel.ERROR) {
      if (this.logs.length === 50) {
        this.logs.shift();
      }
      this.logs.push(`[${new Date().toISOString()}] ${LogLevel[level]}: ${message}`);
    }
  }
}
