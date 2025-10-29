/**
 * Generic TelematicData model
 *
 * Represents container-based telematic data structures.
 * For individual telematic data points, see TelematicDataPoint.ts
 */

import type { TelematicDataPoint } from './TelematicDataPoint';

/**
 * Container for telematic data points
 */
export interface TelematicData {
  /**
   * Vehicle Identification Number
   */
  vin: string;

  /**
   * Timestamp when this data was collected
   */
  timestamp: Date;

  /**
   * Container ID (if using a container-based system)
   */
  containerId?: string;

  /**
   * Array of telematic data points
   */
  dataPoints: TelematicDataPoint[];
}

/**
 * Telematic key categories for organizing data points
 */
export enum TelematicKeyCategory {
  VEHICLE_STATUS = 'VEHICLE_STATUS',
  LOCATION = 'LOCATION',
  BATTERY = 'BATTERY',
  FUEL = 'FUEL',
  DOORS = 'DOORS',
  WINDOWS = 'WINDOWS',
  TIRES = 'TIRES',
  CLIMATE = 'CLIMATE',
  CHARGING = 'CHARGING',
  SERVICE = 'SERVICE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Container request for creating or managing telematic data containers
 */
export interface ContainerRequest {
  /**
   * Container name/identifier
   */
  name: string;

  /**
   * Telematic keys to include in this container
   */
  keys: string[];

  /**
   * Optional description
   */
  description?: string;
}

/**
 * Container response from API
 */
export interface ContainerResponse {
  /**
   * Container ID
   */
  id: string;

  /**
   * Container name
   */
  name: string;

  /**
   * Telematic keys in this container
   */
  keys: string[];

  /**
   * Creation timestamp
   */
  createdAt: Date;
}
