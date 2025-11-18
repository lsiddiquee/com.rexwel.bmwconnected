import { SimpleClass } from 'homey';
import { ILogger, LogContext, LogLevel } from '../lib';
import { LogEntry } from './LogEntry';

/**
 * Logger implementation for Homey app
 * Implements the ILogger interface to provide logging functionality
 */
export class Logger implements ILogger {
  logger: SimpleClass;
  getLogLevel: () => LogLevel;
  logs: LogEntry[] = [];

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
  error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, {
      ...context,
      error: error ? error.message : undefined,
      stack: error ? error.stack : undefined,
    });
  }
  fatal(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.FATAL, message, {
      ...context,
      error: error ? error.message : undefined,
      stack: error ? error.stack : undefined,
    });
  }
  setLevel(_level: LogLevel): void {
    throw new Error('Method not implemented.');
  }
  getLevel(): LogLevel {
    throw new Error('Method not implemented.');
  }

  /**
   * Get recent logs as structured data
   */
  getRecentLogs(): LogEntry[] {
    return this.logs;
  }

  private logInternal(level: LogLevel, message: string): void {
    const logLevel = this.getLogLevel();
    if (level < logLevel && level < LogLevel.ERROR) return;
    if (level === LogLevel.ERROR) this.logger.error(message);
    else this.logger.log(`${LogLevel[level]}: ${message}`);
    if (logLevel || level >= LogLevel.ERROR) {
      if (this.logs.length >= 100) {
        this.logs.shift();
      }
      this.logs.push({
        timestamp: new Date().toISOString(),
        level: LogLevel[level].toLowerCase(),
        message,
      });
    }
  }
}
