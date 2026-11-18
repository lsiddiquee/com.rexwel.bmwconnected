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
    this.log(LogLevel.ERROR, message, this.mergeErrorContext(error, context));
  }
  fatal(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.FATAL, message, this.mergeErrorContext(error, context));
  }

  /**
   * Merge an optional Error object with a caller-supplied context, preserving
   * any `error` / `stack` fields the caller already provided in `context` when
   * no Error object is passed. Issue #108: the previous implementation
   * unconditionally overwrote those keys with `undefined`, silently dropping
   * diagnostic data passed only via the context.
   */
  private mergeErrorContext(error?: Error, context?: LogContext): LogContext | undefined {
    if (!error) return context;
    return {
      ...context,
      error: error.message,
      stack: error.stack,
    };
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
