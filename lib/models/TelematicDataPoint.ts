/**
 * Telematic Data Point Model
 *
 * Core domain model for telematic data points.
 * Used across MQTT streaming, API responses, and caching.
 */

/**
 * Telematic data point from MQTT message or API
 *
 * This is the core normalized format used throughout the application.
 * Both MQTT streaming and API responses are transformed into this format.
 */
export interface TelematicDataPoint {
  /**
   * ISO 8601 timestamp when data was collected by vehicle
   */
  timestamp: string;

  /**
   * Data value (can be number, string, or boolean depending on telematic key)
   */
  value: string | number | boolean;

  /**
   * Unit of measurement (e.g., "km", "degrees", "%", "bar")
   * Optional - not all telematic keys have units
   */
  unit?: string;

  /**
   * Source of this data point (for cache coherence)
   * - 'mqtt': From MQTT streaming
   * - 'api': From REST API polling
   */
  source?: 'mqtt' | 'api';
}
