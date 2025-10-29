import { SimpleClass } from 'homey';
import { ILogger } from '../lib';
import { LogLevel, LogContext } from '../lib';

// Minimal Homey manifest type
interface HomeyManifest {
  id?: string;
  version?: string;
}

// Minimal Homey cloud type
interface HomeyCloud {
  getHomeyId?: () => Promise<string>;
}

// Minimal Homey type for logger context
interface HomeyLike {
  manifest?: HomeyManifest;
  version?: string;
  cloud?: HomeyCloud;
}

interface LogEntry {
  stream: {
    [label: string]: string;
  };
  values: [string, string][];
}

type ContextTags = Record<string, string>;
type ContextExtra = Record<string, unknown>;
type ContextUser = Record<string, unknown>;

export class LokiLogger extends SimpleClass implements ILogger {
  // private readonly homey: HomeyLike;
  private readonly lokiUrl: string;
  private readonly appId: string;
  private readonly appVersion: string;
  private readonly homeyVersion: string;
  private readonly managerCloud: HomeyCloud | undefined;
  private tags: ContextTags = {};
  private extra: ContextExtra = {};
  private user: ContextUser = {};
  private currentLevel: LogLevel = LogLevel.TRACE;

  // Although the reference homey-log package persists the entries for the lifetime of the app,
  // to prevent duplicate logs, this seems like it is a potential memory leak in long-running apps.
  // Hence, commenting it out, if needed, we will implement a size limit or expiration mechanism.
  // private capturedMessages: string[] = [];
  // private capturedExceptions: Error[] = [];

  constructor(homey: HomeyLike, lokiUrl: string, getLogLevel: () => LogLevel) {
    super();

    this.setLevel(getLogLevel());
    if (!homey) {
      LokiLogger._error('Error: missing homey constructor parameter');
      throw new Error('Missing homey instance');
    }
    if (!lokiUrl) {
      LokiLogger._error('No Loki URL provided');
      throw new Error('Missing Loki URL');
    }
    // this.homey = homey;
    this.lokiUrl = lokiUrl;
    this.appId = homey.manifest?.id ?? 'unknown-app';
    this.appVersion = homey.manifest?.version ?? 'unknown-version';
    this.homeyVersion = homey.version ?? 'unknown-homey-version';
    this.managerCloud = homey.cloud;

    // Set initial tags
    this.setTags({
      appId: this.appId,
      appVersion: this.appVersion,
      homeyVersion: this.homeyVersion,
    });

    // Try to get HomeyId and set as tag
    if (this.managerCloud && typeof this.managerCloud.getHomeyId === 'function') {
      this.managerCloud
        .getHomeyId()
        .then((homeyId: string) => this.setTags({ homeyId }))
        .catch((err: unknown) => LokiLogger._error('Error: could not get `homeyId`', err));
    }

    LokiLogger._log(
      this.logLevelToString(LogLevel.INFO),
      `App ${this.appId} v${this.appVersion} logging on Homey v${this.homeyVersion}...`
    );
  }

  log(level: LogLevel, message: string, context?: LogContext): void {
    this.logWithContext(level, message, context);
  }

  trace(message: string, context?: LogContext): void {
    this.logWithContext(LogLevel.TRACE, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logWithContext(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logWithContext(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logWithContext(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    let finalMessage = message;
    if (error) {
      finalMessage = `${message} - Error: ${error.message}`;
    }
    this.logWithContext(LogLevel.ERROR, finalMessage, context);
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    let finalMessage = message;
    if (error) {
      finalMessage = `${message} - Error: ${error.message}`;
    }
    this.logWithContext(LogLevel.FATAL, finalMessage, context);
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLevel;
  }

  private logLevelToString(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE:
        return 'trace';
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
        return 'error';
      default:
        return 'info';
    }
  }

  private logWithContext(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    void this.sendLogToLoki(
      this.logLevelToString(level),
      `${message} ${context ? JSON.stringify(context) : ''}`
    );
  }

  public setTags(tags: ContextTags) {
    this.tags = { ...this.tags, ...tags };
    return this;
  }

  public setExtra(extra: ContextExtra) {
    this.extra = { ...this.extra, ...extra };
    return this;
  }

  public setUser(user: ContextUser) {
    this.user = { ...this.user, ...user };
    return this;
  }

  private buildLogEntry(level: string, message: string): LogEntry {
    // Compose all context into stream labels
    const stream: { [label: string]: string } = {
      level: level,
      app: this.appId,
      ...this.tags,
    };
    // Optionally add extra/user as JSON string
    if (Object.keys(this.extra).length > 0) {
      stream.extra = JSON.stringify(this.extra);
    }
    if (Object.keys(this.user).length > 0) {
      stream.user = JSON.stringify(this.user);
    }
    return {
      stream,
      values: [[LokiLogger._logTime(), message]],
    };
  }

  public async sendLogToLoki(level: string, message: string) {
    const logEntry = this.buildLogEntry(level, message);
    try {
      LokiLogger._log(level, message);
      const response = await fetch(this.lokiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ streams: [logEntry] }),
      });
      if (!response.ok) {
        LokiLogger._error(`Failed to send log to Loki: ${response.statusText}`);
      }
    } catch (error) {
      LokiLogger._error('Error sending log to Loki:', error);
    }
  }

  /**
   * Timestamp for logs in nanosecond format (required by Loki)
   */
  private static _logTime(): string {
    // Loki expects timestamp in nanoseconds as a string
    const now = Date.now();
    const nanoseconds = now * 1000000; // Convert milliseconds to nanoseconds
    return nanoseconds.toString();
  }

  /**
   * Human-readable timestamp for console logs (mimics SDK style)
   */
  private static _consoleLogTime(): string {
    return new Date().toISOString();
  }

  /**
   * Mimic SDK log method (bound, like homey_logger.js).
   */
  private static _log(level: string, ...args: unknown[]): void {
    // eslint-disable-next-line prefer-spread
    (
      console.log.bind(null, LokiLogger._consoleLogTime(), `[${level}]`) as typeof console.log
    ).apply(null, args);
  }

  /**
   * Mimic SDK error method (bound, like homey_logger.js).
   */
  private static _error(...args: unknown[]): void {
    // eslint-disable-next-line prefer-spread
    (
      console.error.bind(null, LokiLogger._consoleLogTime(), '[loki-log]') as typeof console.error
    ).apply(null, args);
  }
}
