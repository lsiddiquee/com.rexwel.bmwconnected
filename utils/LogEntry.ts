/**
 * Structured log entry for easier processing and display
 */
export interface LogEntry {
  timestamp: string;
  level: string; // lowercase level name: "trace", "debug", "info", "warn", "error", "fatal"
  message: string;
}
