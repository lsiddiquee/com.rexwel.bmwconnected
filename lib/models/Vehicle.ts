/**
 * Generic Vehicle model
 *
 * Represents a vehicle with basic attributes, independent of the specific API.
 * This model can be used with any vehicle API implementation.
 */

/**
 * Basic vehicle information
 */
export interface Vehicle {
  /**
   * Vehicle Identification Number
   */
  vin: string;

  /**
   * Vehicle model name (e.g., "X5", "i4")
   */
  model: string;

  /**
   * Vehicle brand (e.g., "BMW", "Mini")
   */
  brand: string;

  /**
   * Manufacturing year
   */
  year: number;

  /**
   * Drive train type (e.g., "ELECTRIC", "PHEV", "COMBUSTION")
   */
  driveTrain: string;

  /**
   * Vehicle color code
   */
  color?: number;

  /**
   * Last time vehicle data was fetched
   */
  lastFetched: Date;

  /**
   * Additional vehicle attributes
   */
  attributes?: VehicleAttributes;
}

/**
 * Extended vehicle attributes
 */
export interface VehicleAttributes {
  /**
   * Body type (e.g., "sedan", "suv", "coupe")
   */
  bodyType?: string;

  /**
   * Head unit type/version
   */
  headUnit?: string;

  /**
   * Software version information
   */
  softwareVersion?: string;

  /**
   * Country of origin
   */
  countryOfOrigin?: string;

  /**
   * Whether this is the primary user
   */
  isPrimaryUser?: boolean;

  /**
   * Additional metadata
   */
  [key: string]: unknown;
}
