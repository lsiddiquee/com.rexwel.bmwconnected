/**
 * Logger Interface
 *
 * Defines the contract for logging implementations.
 * Supports multiple log levels and structured logging.
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

/**
 * Structured log context for additional metadata
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Main logger interface
 */
export interface ILogger {
  /**
   * Log a message at a specific level
   *
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  log(level: LogLevel, message: string, context?: LogContext): void;

  /**
   * Log a trace message (most verbose)
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  trace(message: string, context?: LogContext): void;

  /**
   * Log a debug message
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log an info message
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log a warning message
   *
   * @param message - Log message
   * @param context - Optional context/metadata
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log an error message
   *
   * @param message - Log message
   * @param error - Optional error object
   * @param context - Optional context/metadata
   */
  error(message: string, error?: Error, context?: LogContext): void;

  /**
   * Log a fatal error message
   *
   * @param message - Log message
   * @param error - Optional error object
   * @param context - Optional context/metadata
   */
  fatal(message: string, error?: Error, context?: LogContext): void;

  /**
   * Set minimum log level (messages below this level won't be logged)
   *
   * @param level - Minimum log level
   */
  setLevel(level: LogLevel): void;

  /**
   * Get current minimum log level
   *
   * @returns Current log level
   */
  getLevel(): LogLevel;
}
