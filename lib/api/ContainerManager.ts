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
import { ESSENTIAL_KEYS } from '../types/TelematicKeys';

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
 * Configuration options for ContainerManager
 */
export interface ContainerManagerOptions {
  /**
   * HTTP client for API requests
   */
  httpClient: IHttpClient;

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
  private readonly getAccessToken: () => Promise<string>;
  private readonly logger?: ILogger;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly containerName: string;
  private readonly containerPurpose: string;
  private readonly telematicKeys: readonly string[];
  private readonly containerCache = new Map<string, string>();
  /**
   * In-flight `getOrCreateContainer` promises, keyed by identifier. Used to
   * de-duplicate concurrent pair sessions for the same client so BMW only ever
   * sees a single list+create round-trip per identifier. Issue #108.
   */
  private readonly inFlightLookups = new Map<string, Promise<string>>();

  /**
   * Creates a new ContainerManager instance
   *
   * @param options - Configuration options
   */
  constructor(options: ContainerManagerOptions) {
    this.httpClient = options.httpClient;
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
   * Gets existing container ID from cache or creates a new container
   *
   * Note: Persistent storage is handled by the caller.
   * This method only manages in-memory cache and API calls.
   *
   * Flow:
   * 1. Check in-memory cache
   * 2. List containers on BMW and reuse one whose name embeds the identifier
   *    (so we don't pile up duplicate containers across pairings — issue #108)
   * 3. Create new container only if no match found
   * 4. Cache container ID
   *
   * Concurrent calls for the same identifier share the same in-flight promise
   * so we never issue duplicate list/create round-trips.
   *
   * @param identifier - Unique identifier (VIN, client ID prefix, or custom key)
   * @returns Container ID
   * @throws {ApiError} If container creation fails
   */
  async getOrCreateContainer(identifier: string): Promise<string> {
    this.logger?.debug('Getting or creating container', { identifier });

    // Check in-memory cache first - fast path, no de-duplication needed.
    const cachedId = this.containerCache.get(identifier);
    if (cachedId) {
      this.logger?.debug('Using cached container ID', { identifier, containerId: cachedId });
      return cachedId;
    }

    // De-duplicate concurrent calls (e.g. quick double-click during pairing).
    const inFlight = this.inFlightLookups.get(identifier);
    if (inFlight) {
      this.logger?.debug('Reusing in-flight container lookup', { identifier });
      return inFlight;
    }

    const lookup = this.resolveContainer(identifier).finally(() => {
      this.inFlightLookups.delete(identifier);
    });
    this.inFlightLookups.set(identifier, lookup);
    return lookup;
  }

  /**
   * Resolves a container for the given identifier by:
   * 1. Listing existing containers and matching on name (so duplicates aren't
   *    created on each pairing attempt — issue #108).
   * 2. Falling back to creating a fresh container with an identifier-embedded
   *    name so the next pairing finds it via step 1.
   *
   * @param identifier - Unique identifier (VIN, client ID prefix, custom key)
   * @returns Container ID
   * @private
   */
  private async resolveContainer(identifier: string): Promise<string> {
    const expectedName = this.buildContainerName(identifier);

    // Try to reuse a previously-created container. We swallow listing failures
    // here so a transient list-endpoint hiccup doesn't block pairing — we'll
    // attempt to create instead and let that error surface if it also fails.
    try {
      const existing = await this.listContainers();
      const match = existing.find((c) => c.name === expectedName);
      if (match) {
        this.logger?.info('Reusing existing container', {
          identifier,
          containerId: match.containerId,
        });
        this.containerCache.set(identifier, match.containerId);
        return match.containerId;
      }
    } catch (error) {
      this.logger?.warn('Container list lookup failed - falling back to create', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Create new container
    this.logger?.info('Creating new container', { identifier });
    const containerId = await this.createContainer(identifier);

    // Cache the new container ID
    this.containerCache.set(identifier, containerId);

    this.logger?.info('Container created and cached', { identifier, containerId });
    return containerId;
  }

  /**
   * Builds the BMW-visible container name for an identifier, embedding the
   * identifier so the container is discoverable via listContainers() on
   * subsequent pair attempts.
   */
  private buildContainerName(identifier: string): string {
    return `${this.containerName} (${identifier})`;
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
      name: this.buildContainerName(identifier),
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
   * Also removes from cache. Persistent storage cleanup is handled by caller.
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
   * Sets cached container ID for a VIN
   *
   * Used by caller after loading container ID from persistent storage.
   *
   * @param vin - Vehicle Identification Number
   * @param containerId - Container identifier
   */
  setCachedContainerId(vin: string, containerId: string): void {
    this.containerCache.set(vin, containerId);
    this.logger?.debug('Container ID cached', { vin, containerId });
  }

  /**
   * Gets cached container ID for a VIN (if any)
   *
   * @param vin - Vehicle Identification Number
   * @returns Container ID if cached, undefined otherwise
   */
  getCachedContainerId(vin: string): string | undefined {
    return this.containerCache.get(vin);
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
