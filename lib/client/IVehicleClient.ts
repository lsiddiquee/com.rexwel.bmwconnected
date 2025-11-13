/**
 * Vehicle Client Interface
 *
 * Defines the contract for interacting with vehicle data APIs.
 * Implementations can use different backend services (e.g., BMW ConnectedDrive, BMW CarData).
 */

import type { VehicleStatus } from '../models/VehicleStatus';
import type { Vehicle } from '../models/Vehicle';
import type { TelematicDataPoint } from '../models/TelematicDataPoint';

/**
 * Main interface for vehicle client implementations
 */
export interface IVehicleClient {
  /**
   * Authenticate with the vehicle API
   *
   * @returns Promise that resolves when authentication is complete
   * @throws {AuthenticationError} If authentication fails
   */
  authenticate(): Promise<void>;

  /**
   * Check if the client is currently authenticated
   *
   * @returns true if authenticated, false otherwise
   */
  isAuthenticated(): boolean;

  /**
   * Get list of all vehicles associated with the account
   *
   * @returns Promise resolving to array of vehicles
   * @throws {ApiError} If the API request fails
   */
  getVehicles(): Promise<Vehicle[]>;

  /**
   * Get current status for a specific vehicle
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - Optional BMW CarData container ID for telematic data retrieval
   * @returns Promise resolving to vehicle status
   * @throws {VehicleNotFoundError} If vehicle doesn't exist
   * @throws {ApiError} If the API request fails
   */
  getVehicleStatus(vin: string, containerId?: string): Promise<VehicleStatus>;

  /**
   * Get raw telematic data for a specific vehicle
   *
   * Returns raw telematic data points for direct cache updates.
   * This is the preferred method for cache population as it avoids VehicleStatus conversion.
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - BMW CarData container ID (required for telematic data retrieval)
   * @returns Promise resolving to raw telematic data points
   * @throws {VehicleNotFoundError} If vehicle doesn't exist
   * @throws {ApiError} If the API request fails
   */
  getRawTelematicData(
    vin: string,
    containerId: string
  ): Promise<Record<string, TelematicDataPoint>>;

  /**
   * Refresh authentication tokens if needed
   *
   * @returns Promise that resolves when tokens are refreshed
   * @throws {AuthenticationError} If token refresh fails
   */
  refreshAuthentication(): Promise<void>;

  /**
   * Disconnect and clean up resources
   */
  disconnect(): Promise<void>;
}
