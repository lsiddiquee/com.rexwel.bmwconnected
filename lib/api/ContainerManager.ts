/**
 * BMW CarData API Container Manager
 *
 * Manages telematic data containers for BMW CarData API.
 * Containers define which telematic keys to retrieve from the API.
 *
 * @see https://api-cardata.bmwgroup.com
 */

import type { IHttpClient } from '../http/IHttpClient';
import type { ILogger } from '../types/ILogger';
import { ApiError } from '../types/errors';
import { ESSENTIAL_KEYS } from './TelematicKeys';

/**
 * BMW CarData API-specific container creation request
 */
interface ApiContainerRequest {
  /**
   * Human-readable container name
   */
  name: string;

  /**
   * Description of container purpose
   */
  purpose: string;

  /**
   * Array of telematic data keys to include in container
   */
  technicalDescriptors: string[];
}

/**
 * BMW CarData API-specific container response
 */
interface ApiContainerResponse {
  /**
   * Unique container identifier
   */
  containerId: string;

  /**
   * Container name
   */
  name: string;

  /**
   * Container purpose description
   */
  purpose: string;

  /**
   * Telematic data keys in container
   */
  technicalDescriptors: string[];

  /**
   * Container state (ACTIVE or INACTIVE)
   */
  state?: string;
}

/**
 * Container storage interface
 */
export interface IContainerStore {
  /**
   * Retrieve stored container ID for an identifier
   *
   * @param identifier - Unique identifier (VIN, client ID, or custom key)
   * @returns Container ID or null if not found
   */
  getContainerId(identifier: string): Promise<string | null>;

  /**
   * Store container ID for an identifier
   *
   * @param identifier - Unique identifier (VIN, client ID, or custom key)
   * @param containerId - Container identifier
   */
  setContainerId(identifier: string, containerId: string): Promise<void>;

  /**
   * Remove stored container ID for an identifier
   *
   * @param identifier - Unique identifier (VIN, client ID, or custom key)
   */
  deleteContainerId(identifier: string): Promise<void>;
}

/**
 * Configuration options for ContainerManager
 */
export interface ContainerManagerOptions {
  /**
   * HTTP client for API requests
   */
  httpClient: IHttpClient;

  /**
   * Container storage implementation
   */
  containerStore: IContainerStore;

  /**
   * Function to get valid access token
   */
  getAccessToken: () => Promise<string>;

  /**
   * Optional logger for debugging
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

  /**
   * Default container name (default: "Homey BMW Integration")
   */
  containerName?: string;

  /**
   * Default container purpose (default: "Vehicle telemetry for Homey smart home")
   */
  containerPurpose?: string;

  /**
   * Custom telematic data keys (default: DEFAULT_TELEMATIC_KEYS)
   */
  telematicKeys?: readonly string[];
}

/**
 * ContainerManager - Manages BMW CarData API containers
 *
 * Handles creation, retrieval, and caching of containers that define
 * which telematic data keys to fetch from the BMW CarData API.
 *
 * Features:
 * - One container per vehicle
 * - Automatic container creation
 * - Container ID caching
 * - Configurable telematic keys
 *
 * @example
 * const manager = new ContainerManager({
 *   httpClient: myHttpClient,
 *   containerStore: myStore,
 *   getAccessToken: async () => await authProvider.getValidAccessToken(),
 *   logger: myLogger
 * });
 *
 * const containerId = await manager.getOrCreateContainer('WBY31AW090FP15359');
 * // Use containerId for telematic data requests
 */
export class ContainerManager {
  private readonly httpClient: IHttpClient;
  private readonly containerStore: IContainerStore;
  private readonly getAccessToken: () => Promise<string>;
  private readonly logger?: ILogger;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly containerName: string;
  private readonly containerPurpose: string;
  private readonly telematicKeys: readonly string[];

  /**
   * In-memory cache of container IDs by identifier
   */
  private readonly containerCache: Map<string, string> = new Map();

  /**
   * Creates a new ContainerManager instance
   *
   * @param options - Configuration options
   */
  constructor(options: ContainerManagerOptions) {
    this.httpClient = options.httpClient;
    this.containerStore = options.containerStore;
    this.getAccessToken = options.getAccessToken;
    this.logger = options.logger;
    this.baseUrl = options.baseUrl ?? 'https://api-cardata.bmwgroup.com';
    this.apiVersion = options.apiVersion ?? 'v1';
    this.containerName = options.containerName ?? 'Homey BMW Integration';
    this.containerPurpose = options.containerPurpose ?? 'Vehicle telemetry for Homey smart home';
    this.telematicKeys = options.telematicKeys ?? ESSENTIAL_KEYS;

    this.logger?.debug('ContainerManager initialized', {
      baseUrl: this.baseUrl,
      apiVersion: this.apiVersion,
      telematicKeyCount: this.telematicKeys.length,
    });
  }

  /**
   * Gets existing container ID or creates a new container
   *
   * Flow:
   * 1. Check in-memory cache
   * 2. Check persistent storage
   * 3. Create new container if not found
   * 4. Store and cache container ID
   *
   * @param identifier - Unique identifier (VIN, client ID prefix, or custom key)
   * @returns Container ID
   * @throws {ApiError} If container creation fails
   */
  async getOrCreateContainer(identifier: string): Promise<string> {
    this.logger?.debug('Getting or creating container', { identifier });

    // Check in-memory cache first
    const cachedId = this.containerCache.get(identifier);
    if (cachedId) {
      this.logger?.debug('Using cached container ID', { identifier, containerId: cachedId });
      return cachedId;
    }

    // Check persistent storage
    const storedId = await this.containerStore.getContainerId(identifier);
    if (storedId) {
      this.logger?.debug('Using stored container ID', { identifier, containerId: storedId });
      this.containerCache.set(identifier, storedId);
      return storedId;
    }

    // Create new container
    this.logger?.info('Creating new container', { identifier });
    const containerId = await this.createContainer(identifier);

    // Store and cache
    await this.containerStore.setContainerId(identifier, containerId);
    this.containerCache.set(identifier, containerId);

    this.logger?.info('Container created and stored', { identifier, containerId });
    return containerId;
  }

  /**
   * Creates a new container via BMW CarData API
   *
   * @param identifier - Unique identifier (for logging/tracking only)
   * @returns Container ID
   * @throws {ApiError} If API request fails
   * @private
   */
  private async createContainer(identifier: string): Promise<string> {
    const accessToken = await this.getAccessToken();

    const request: ApiContainerRequest = {
      name: this.containerName,
      purpose: this.containerPurpose,
      technicalDescriptors: [...this.telematicKeys],
    };

    this.logger?.debug('Creating container', {
      identifier,
      descriptorCount: request.technicalDescriptors.length,
    });

    try {
      const response = await this.httpClient.post<ApiContainerResponse>(
        `${this.baseUrl}/customers/containers`,
        request,
        this.buildHeaders(accessToken)
      );

      if (!response.data?.containerId) {
        throw new ApiError(
          'Container creation response missing containerId',
          500,
          'invalid_response'
        );
      }

      return response.data.containerId;
    } catch (error) {
      this.logger?.error('Container creation failed', error as Error, { identifier });
      throw error;
    }
  }

  /**
   * Lists all containers for the authenticated user
   *
   * Useful for debugging and troubleshooting.
   *
   * @returns Array of containers
   * @throws {ApiError} If API request fails
   */
  async listContainers(): Promise<ApiContainerResponse[]> {
    this.logger?.debug('Listing containers');

    const accessToken = await this.getAccessToken();

    const response = await this.httpClient.get<
      ApiContainerResponse[] | { containers: ApiContainerResponse[] }
    >(`${this.baseUrl}/customers/containers`, this.buildHeaders(accessToken));

    // API may return array directly or wrapped in { containers: [] }
    let containers: ApiContainerResponse[];
    if (Array.isArray(response.data)) {
      containers = response.data;
    } else if (
      response.data &&
      Array.isArray((response.data as { containers: ApiContainerResponse[] }).containers)
    ) {
      containers = (response.data as { containers: ApiContainerResponse[] }).containers;
    } else {
      containers = [];
    }

    this.logger?.debug('Containers listed', { count: containers.length });
    return containers;
  }

  /**
   * Deletes a container by ID
   *
   * Also removes from cache and persistent storage for all VINs.
   *
   * @param containerId - Container identifier
   * @throws {ApiError} If API request fails
   */
  async deleteContainer(containerId: string): Promise<void> {
    this.logger?.info('Deleting container', { containerId });

    const accessToken = await this.getAccessToken();

    try {
      await this.httpClient.delete(
        `${this.baseUrl}/customers/containers/${containerId}`,
        this.buildHeaders(accessToken)
      );

      // Remove from cache
      for (const [vin, cachedId] of this.containerCache.entries()) {
        if (cachedId === containerId) {
          this.containerCache.delete(vin);
          await this.containerStore.deleteContainerId(vin);
        }
      }

      this.logger?.info('Container deleted', { containerId });
    } catch (error) {
      // 404 is acceptable (already deleted)
      if (error instanceof ApiError && error.statusCode === 404) {
        this.logger?.debug('Container already deleted', { containerId });
        return;
      }
      throw error;
    }
  }

  /**
   * Clears cached container ID for a VIN
   *
   * Forces container lookup/creation on next getOrCreateContainer call.
   *
   * @param vin - Vehicle Identification Number
   */
  clearCache(vin: string): void {
    this.containerCache.delete(vin);
    this.logger?.debug('Container cache cleared', { vin });
  }

  /**
   * Clears all cached container IDs
   */
  clearAllCache(): void {
    this.containerCache.clear();
    this.logger?.debug('All container cache cleared');
  }

  /**
   * Validates an existing container by ID
   *
   * Checks if the container exists and contains all required ESSENTIAL_KEYS.
   *
   * @param containerId - Container identifier to validate
   * @returns Validation result with container info and missing keys (if any)
   * @throws {ApiError} If container doesn't exist or API request fails
   */
  async validateContainer(containerId: string): Promise<{
    isValid: boolean;
    container?: ApiContainerResponse;
    missingKeys?: string[];
  }> {
    this.logger?.debug('Validating container', { containerId });

    try {
      const accessToken = await this.getAccessToken();

      // Get container details
      const response = await this.httpClient.get<ApiContainerResponse>(
        `${this.baseUrl}/customers/containers/${containerId}`,
        this.buildHeaders(accessToken)
      );

      const container = response.data;

      // Check if all required keys are present
      const containerKeys = new Set(container.technicalDescriptors || []);
      const missingKeys: string[] = [];

      for (const key of this.telematicKeys) {
        if (!containerKeys.has(key)) {
          missingKeys.push(key);
        }
      }

      const isValid = missingKeys.length === 0;

      if (isValid) {
        this.logger?.info('Container validation successful', {
          containerId,
          keyCount: container.technicalDescriptors?.length,
        });
      } else {
        this.logger?.warn('Container missing required keys', {
          containerId,
          missingCount: missingKeys.length,
        });
      }

      return {
        isValid,
        container,
        missingKeys: missingKeys.length > 0 ? missingKeys : undefined,
      };
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        this.logger?.error(`Container not found: ${containerId}`);
        throw new ApiError('Container not found', 404);
      }
      throw error;
    }
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
}
