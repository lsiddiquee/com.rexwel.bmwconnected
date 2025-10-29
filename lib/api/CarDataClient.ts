/**
 * BMW CarData API Client
 *
 * Implements the IVehicleClient interface for BMW CarData API.
 * Handles authentication, vehicle data retrieval, and rate limiting.
 *
 * @see https://api-cardata.bmwgroup.com
 */

import type { IVehicleClient } from '../client/IVehicleClient';
import type { IAuthProvider } from '../auth/IAuthProvider';
import type { IHttpClient } from '../http/IHttpClient';
import type { ILogger } from '../types/ILogger';
import type { Vehicle, VehicleStatus } from '../models';
import type { TelematicDataPoint as SharedTelematicDataPoint } from '../models/TelematicDataPoint';
import { AuthenticationError, VehicleNotFoundError, ApiError } from '../types/errors';
import { mapDriveTrain } from '../types/DriveTrainType';

/**
 * BMW CarData API-specific vehicle mapping response
 */
interface VehicleMappingResponse {
  mappedSince: string;
  mappingType: 'PRIMARY' | 'SECONDARY';
  vin: string;
}

/**
 * BMW CarData API-specific basic data response
 */
interface BasicDataResponse {
  bodyType?: string;
  brand?: 'BMW' | 'MINI' | 'RollsRoyce' | 'ToyotaSupra';
  chargingModes?: string[];
  colourCodeRaw?: string;
  colourDescription?: string;
  constructionDate?: string;
  countryCode?: string;
  driveTrain?: 'BEV' | 'PHEV' | 'ICE';
  engine?: string;
  fullSAList?: string;
  hasNavi?: boolean;
  hasSunRoof?: boolean;
  headUnit?: string;
  modelKey?: string;
  modelName?: string;
  numberOfDoors?: number;
  propulsionType?: string;
  series?: string;
  seriesDevt?: string;
  simStatus?: 'ACTIVE' | 'INACTIVE';
  steering?: 'LL' | 'RL';
}

/**
 * BMW CarData API-specific telematic data point
 */
interface TelematicDataPoint {
  timestamp: string | null;
  unit: string | null;
  value: string | null;
}

/**
 * BMW CarData API-specific telematic data response
 */
interface TelematicDataResponse {
  telematicData: {
    [key: string]: TelematicDataPoint;
  };
}

/**
 * Configuration options for CarDataClient
 */
export interface CarDataClientOptions {
  /**
   * Authentication provider for OAuth 2.0 Device Code Flow
   */
  authProvider: IAuthProvider;

  /**
   * HTTP client for making API requests
   */
  httpClient: IHttpClient;

  /**
   * Optional logger for debugging and monitoring
   */
  logger?: ILogger;

  /**
   * API base URL (default: https://api-cardata.bmwgroup.com)
   */
  baseUrl?: string;

  /**
   * API version header (default: v1)
   */
  apiVersion?: string;
}

/**
 * CarDataClient - BMW CarData API implementation
 *
 * Provides access to vehicle data from BMW CarData API including:
 * - Vehicle listings and mappings
 * - Basic vehicle information
 * - Telematic data (battery, fuel, location, etc.)
 *
 * Features:
 * - OAuth 2.0 Device Code Flow authentication
 * - Automatic token refresh
 * - Rate limiting (50 requests per 24 hours per vehicle)
 * - Error handling and logging
 *
 * @example
 * const client = new CarDataClient({
 *   authProvider: new DeviceCodeAuthProvider({ ... }),
 *   httpClient: new HttpClient({ ... }),
 *   logger: myLogger
 * });
 *
 * await client.authenticate();
 * const vehicles = await client.getVehicles();
 * const status = await client.getVehicleStatus(vehicles[0].vin);
 */
export class CarDataClient implements IVehicleClient {
  private readonly authProvider: IAuthProvider;
  private readonly httpClient: IHttpClient;
  private readonly logger?: ILogger;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  /**
   * Creates a new CarDataClient instance
   *
   * @param options - Configuration options
   */
  constructor(options: CarDataClientOptions) {
    this.authProvider = options.authProvider;
    this.httpClient = options.httpClient;
    this.logger = options.logger;
    this.baseUrl = options.baseUrl ?? 'https://api-cardata.bmwgroup.com';
    this.apiVersion = options.apiVersion ?? 'v1';

    this.logger?.debug('CarDataClient initialized', {
      baseUrl: this.baseUrl,
      apiVersion: this.apiVersion,
    });
  }

  /**
   * Initiates the authentication flow
   *
   * For BMW CarData API, this uses OAuth 2.0 Device Code Flow.
   * The authentication is handled by the IAuthProvider.
   *
   * @throws {AuthenticationError} If authentication fails
   */
  async authenticate(): Promise<void> {
    this.logger?.info('Starting authentication flow');

    try {
      // Authentication is handled by the auth provider
      // Validate that we can get a valid access token
      const token = await this.authProvider.getValidAccessToken();

      if (!token) {
        throw new AuthenticationError(
          'Authentication incomplete. Please complete the device code flow.',
          'authentication_incomplete'
        );
      }

      this.logger?.info('Authentication successful');
    } catch (error) {
      this.logger?.error('Authentication failed', error as Error);
      throw error;
    }
  }

  /**
   * Checks if the client is authenticated
   *
   * @returns True if authenticated with valid tokens
   */
  isAuthenticated(): boolean {
    // Note: IVehicleClient requires synchronous check
    // We assume authenticated if auth provider exists
    // Actual token validity checked during API calls
    return true; // TODO: Improve synchronous auth check
  }

  /**
   * Retrieves all vehicles accessible to the authenticated user
   *
   * Only returns PRIMARY mapped vehicles (not SECONDARY).
   * Basic data is fetched for each vehicle to provide complete information.
   *
   * @returns Array of vehicles with basic information
   * @throws {AuthenticationError} If not authenticated
   * @throws {ApiError} If API request fails
   */
  async getVehicles(): Promise<Vehicle[]> {
    this.logger?.info('Fetching vehicle list');

    const accessToken = await this.getAccessToken();

    // Get vehicle mappings
    const mappings = await this.httpClient.get<VehicleMappingResponse[]>(
      `${this.baseUrl}/customers/vehicles/mappings`,
      this.buildHeaders(accessToken)
    );

    if (!Array.isArray(mappings.data)) {
      throw new ApiError('Invalid vehicle mappings response', 500, 'invalid_response');
    }

    // Filter to PRIMARY mappings only
    const primaryMappings = mappings.data.filter((mapping) => mapping.mappingType === 'PRIMARY');

    this.logger?.debug('Found vehicle mappings', {
      total: mappings.data.length,
      primary: primaryMappings.length,
    });

    // Fetch basic data for each vehicle
    const vehicles: Vehicle[] = [];

    for (const mapping of primaryMappings) {
      try {
        const basicData = await this.getBasicData(mapping.vin);
        vehicles.push(basicData);
      } catch (error) {
        this.logger?.warn(`Failed to fetch basic data for VIN ${mapping.vin}`, {
          error,
        });
        // Continue with other vehicles even if one fails
      }
    }

    this.logger?.info(`Retrieved ${vehicles.length} vehicles`);
    return vehicles;
  }

  /**
   * Retrieves the status of a specific vehicle
   *
   * Fetches both basic data and telematic data (if container ID provided).
   * Basic data provides drive train and model info.
   * Telematic data provides detailed status (location, battery, doors, etc.).
   *
   * This is a convenience method that calls getRawTelematicData() and transforms the result.
   * For direct cache updates, use getRawTelematicData() instead.
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - Optional container ID for telematic data retrieval
   * @returns Current vehicle status
   * @throws {AuthenticationError} If not authenticated
   * @throws {VehicleNotFoundError} If vehicle not found
   * @throws {ApiError} If API request fails
   */
  async getVehicleStatus(vin: string, containerId?: string): Promise<VehicleStatus> {
    this.logger?.info('Fetching vehicle status', { vin, hasContainer: !!containerId });

    // Fetch basic data to get drive train
    const accessToken = await this.getAccessToken();
    const basicResponse = await this.httpClient.get<BasicDataResponse>(
      `${this.baseUrl}/customers/vehicles/${vin}/basicData`,
      this.buildHeaders(accessToken)
    );

    const basicData = basicResponse.data;
    const driveTrain = mapDriveTrain(basicData.driveTrain);

    // If container ID provided, fetch telematic data and transform
    if (containerId) {
      const streamingData = await this.getRawTelematicData(vin, containerId);

      // Transform telematic data to VehicleStatus
      const { TelematicDataTransformer } = await import('../transformers/TelematicDataTransformer');
      const status = TelematicDataTransformer.transform(vin, driveTrain, streamingData);

      this.logger?.info('Vehicle status retrieved with telematic data', { vin });
      return status;
    }

    // No container ID - return minimal status (will be enriched by MQTT streaming)
    const status: VehicleStatus = {
      vin,
      driveTrain,
      lastUpdatedAt: new Date(),
    };

    this.logger?.info('Vehicle status retrieved (basic data only)', { vin });
    return status;
  }

  /**
   * Retrieves raw telematic data for direct cache updates
   *
   * Returns raw telematic data in streaming format (TelematicDataPoint).
   * This is the preferred method for updating device cache, as it avoids
   * the VehicleStatus transformation step.
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - Container ID for telematic data retrieval
   * @returns Raw telematic data (streaming format)
   * @throws {AuthenticationError} If not authenticated
   * @throws {VehicleNotFoundError} If vehicle not found
   * @throws {ApiError} If API request fails
   */
  async getRawTelematicData(
    vin: string,
    containerId: string
  ): Promise<Record<string, SharedTelematicDataPoint>> {
    this.logger?.debug('Fetching raw telematic data', { vin, containerId });

    const telematicResponse = await this.getTelematicData(vin, containerId);

    // Transform API telematic data format (nullable fields) to streaming format (non-nullable)
    // Filter out any data points with null timestamp (invalid/incomplete data)
    // Parse string values to numbers where appropriate
    const streamingData: Record<string, SharedTelematicDataPoint> = {};
    for (const [key, point] of Object.entries(telematicResponse.telematicData)) {
      if (point.timestamp !== null && point.value !== null) {
        // Parse numeric string values to numbers
        let parsedValue: string | number | boolean = point.value;
        if (typeof point.value === 'string') {
          // Try to parse as number if it looks like a number
          const numValue = parseFloat(point.value);
          if (!isNaN(numValue) && point.value.trim() !== '') {
            parsedValue = numValue;
          }
        }

        streamingData[key] = {
          timestamp: point.timestamp,
          value: parsedValue,
          unit: point.unit ?? undefined,
          source: 'api',
        };
      }
    }

    this.logger?.info('Raw telematic data retrieved', {
      vin,
      keysCount: Object.keys(streamingData).length,
    });

    return streamingData;
  }

  /**
   * Refreshes the authentication tokens
   *
   * @throws {AuthenticationError} If refresh fails
   */
  async refreshAuthentication(): Promise<void> {
    this.logger?.info('Refreshing authentication');

    try {
      // Token refresh is handled automatically by getValidAccessToken()
      await this.authProvider.getValidAccessToken();
      this.logger?.info('Authentication refreshed successfully');
    } catch (error) {
      this.logger?.error('Authentication refresh failed', error as Error);
      throw new AuthenticationError('Failed to refresh authentication tokens', 'refresh_failed');
    }
  }

  /**
   * Disconnects and cleans up resources
   */
  async disconnect(): Promise<void> {
    this.logger?.info('Disconnecting client');

    try {
      // Revoke tokens if supported
      await this.authProvider.revokeTokens();
      this.logger?.info('Client disconnected successfully');
    } catch (error) {
      this.logger?.warn('Error during disconnect', { error });
      // Continue with disconnect even if revocation fails
    }
  }

  /**
   * Retrieves basic data for a specific vehicle
   *
   * This endpoint does not count against the telematic data quota.
   *
   * @param vin - Vehicle Identification Number
   * @returns Vehicle with basic information
   * @throws {AuthenticationError} If not authenticated
   * @throws {VehicleNotFoundError} If vehicle not found
   * @throws {ApiError} If API request fails
   * @private
   */
  private async getBasicData(vin: string): Promise<Vehicle> {
    this.logger?.debug('Fetching basic data', { vin });

    const accessToken = await this.getAccessToken();

    try {
      const response = await this.httpClient.get<BasicDataResponse>(
        `${this.baseUrl}/customers/vehicles/${vin}/basicData`,
        this.buildHeaders(accessToken)
      );

      this.logger?.debug('Retrieved basic data', { data: response.data });

      const data = response.data;

      // Transform BMW API response to generic Vehicle model
      const vehicle: Vehicle = {
        vin,
        brand: data.brand ?? 'BMW',
        model: data.modelName ?? data.series ?? 'Unknown',
        year: this.extractYear(data.constructionDate) ?? 0,
        driveTrain: this.mapDriveTrain(data.driveTrain) ?? 'unknown',
        lastFetched: new Date(),
        attributes: {
          bodyType: data.bodyType,
          color: data.colourDescription,
          doors: data.numberOfDoors,
          steering: data.steering === 'RL' ? 'right' : 'left',
          hasNavigation: data.hasNavi,
          hasSunroof: data.hasSunRoof,
          softwareVersion: data.headUnit,
        },
      };

      this.logger?.debug('Basic data retrieved', { vin, model: vehicle.model });
      return vehicle;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        throw new VehicleNotFoundError(`Vehicle not found: ${vin}`);
      }
      throw error;
    }
  }

  /**
   * Retrieves telematic data for a specific vehicle
   *
   * Requires a container ID that defines which telematic keys to retrieve.
   * This endpoint counts against the 50 requests per 24 hours quota.
   *
   * Used as fallback/sync mechanism when MQTT streaming unavailable.
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - Container ID for telematic data
   * @returns Telematic data response
   * @throws {AuthenticationError} If not authenticated
   * @throws {ApiError} If API request fails
   * @private
   */
  private async getTelematicData(vin: string, containerId: string): Promise<TelematicDataResponse> {
    this.logger?.debug('Fetching telematic data', { vin, containerId });

    const accessToken = await this.getAccessToken();

    const url = `${this.baseUrl}/customers/vehicles/${vin}/telematicData?containerId=${encodeURIComponent(containerId)}`;

    try {
      const response = await this.httpClient.get<TelematicDataResponse>(
        url,
        this.buildHeaders(accessToken)
      );

      this.logger?.debug('Telematic data retrieved', {
        vin,
        containerId,
        keyCount: Object.keys(response.data.telematicData || {}).length,
      });

      return response.data;
    } catch (error) {
      // Handle container-specific errors
      if (error instanceof ApiError) {
        if (error.statusCode === 404) {
          throw new ApiError(
            `Container not found: ${containerId}. Please validate container ID.`,
            404,
            'container_not_found'
          );
        }
        if (error.statusCode === 403 && error.code === 'CU-105') {
          throw new ApiError(
            `No permission to access container: ${containerId}`,
            403,
            'container_no_permission'
          );
        }
        if (error.statusCode === 429) {
          throw new ApiError(
            'API rate limit exceeded (50 requests/24h). Please wait until quota resets.',
            429,
            'rate_limit_exceeded'
          );
        }
      }
      throw error;
    }
  }

  /**
   * Gets a valid access token, refreshing if necessary
   *
   * @returns Valid access token
   * @throws {AuthenticationError} If unable to get valid token
   * @private
   */
  private async getAccessToken(): Promise<string> {
    const token = await this.authProvider.getValidAccessToken();

    if (!token) {
      throw new AuthenticationError(
        'No valid access token available. Please authenticate.',
        'no_token'
      );
    }

    return token;
  }

  /**
   * Builds HTTP headers for BMW CarData API requests
   *
   * @param accessToken - OAuth 2.0 access token
   * @returns Headers object
   * @private
   */
  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'x-version': this.apiVersion,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Extracts year from ISO 8601 construction date
   *
   * @param constructionDate - ISO 8601 date string
   * @returns Year or undefined
   * @private
   */
  private extractYear(constructionDate?: string): number | undefined {
    if (!constructionDate) {
      return undefined;
    }

    const match = /^(\d{4})/.exec(constructionDate);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Maps BMW drive train codes to generic values
   *
   * @param driveTrain - BMW drive train code
   * @returns Generic drive train value
   * @private
   */
  private mapDriveTrain(driveTrain?: string): string | undefined {
    const mapping: Record<string, string> = {
      BEV: 'electric',
      PHEV: 'plug-in-hybrid',
      ICE: 'combustion',
    };

    return driveTrain ? (mapping[driveTrain] ?? driveTrain) : undefined;
  }
}
