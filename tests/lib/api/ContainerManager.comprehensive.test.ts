/**
 * Comprehensive Unit Tests for ContainerManager (Simplified Architecture)
 *
 * Tests BMW CarData API container management with simplified architecture:
 * - Constructor and initialization
 * - Container lifecycle (create, get, list, delete, validate)
 * - In-memory caching mechanisms
 * - Error handling and edge cases
 *
 * Note: Storage abstraction removed - caller handles persistent storage via Homey device store
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ContainerManager, type ContainerManagerOptions } from '../../../lib/api/ContainerManager';
import type { IHttpClient, HttpResponse } from '../../../lib/http/IHttpClient';
import type { ILogger } from '../../../lib/types/ILogger';
import { ApiError, RateLimitError } from '../../../lib/types/errors';

describe('ContainerManager - Simplified Architecture Tests', () => {
  let containerManager: ContainerManager;
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let mockGetAccessToken: jest.MockedFunction<() => Promise<string>>;
  let mockLogger: jest.Mocked<ILogger>;
  let managerOptions: ContainerManagerOptions;

  // Helper function to create HTTP responses
  const createHttpResponse = <T>(data: T, status = 200): HttpResponse<T> => ({
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    data,
  });

  beforeEach(() => {
    // Mock HTTP client
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
    } as any;

    // Mock access token provider
    mockGetAccessToken = jest.fn();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as any;

    // Default manager options
    managerOptions = {
      httpClient: mockHttpClient,
      getAccessToken: mockGetAccessToken,
      logger: mockLogger,
      baseUrl: 'https://api-cardata.bmwgroup.com',
      apiVersion: 'v1',
      containerName: 'Test Container',
      containerPurpose: 'Testing telematic data',
      telematicKeys: ['vehicle.fuel_level', 'vehicle.battery_level', 'vehicle.location.latitude'],
    };
  });

  describe('Constructor & Initialization', () => {
    it('should_createManager_when_allOptionsProvided', () => {
      // Act
      const manager = new ContainerManager(managerOptions);

      // Assert
      expect(manager).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('ContainerManager initialized', {
        baseUrl: 'https://api-cardata.bmwgroup.com',
        apiVersion: 'v1',
        telematicKeyCount: 3,
      });
    });

    it('should_useDefaults_when_optionalParametersOmitted', () => {
      // Arrange
      const minimalOptions: ContainerManagerOptions = {
        httpClient: mockHttpClient,
        getAccessToken: mockGetAccessToken,
      };

      // Act
      const manager = new ContainerManager(minimalOptions);

      // Assert
      expect(manager).toBeDefined();
      // Should use default values for missing options without throwing
    });

    it('should_useCustomValues_when_configurationProvided', () => {
      // Arrange
      const customOptions: ContainerManagerOptions = {
        httpClient: mockHttpClient,
        getAccessToken: mockGetAccessToken,
        logger: mockLogger,
        baseUrl: 'https://custom-api.example.com',
        apiVersion: 'v2',
        containerName: 'Custom Container',
        containerPurpose: 'Custom purpose',
        telematicKeys: ['custom.key1', 'custom.key2'],
      };

      // Act
      new ContainerManager(customOptions);

      // Assert
      expect(mockLogger.debug).toHaveBeenCalledWith('ContainerManager initialized', {
        baseUrl: 'https://custom-api.example.com',
        apiVersion: 'v2',
        telematicKeyCount: 2,
      });
    });

    it('should_workWithoutLogger_when_loggerNotProvided', () => {
      // Arrange
      const optionsWithoutLogger: ContainerManagerOptions = {
        httpClient: mockHttpClient,
        getAccessToken: mockGetAccessToken,
      };

      // Act & Assert
      expect(() => new ContainerManager(optionsWithoutLogger)).not.toThrow();
    });
  });

  describe('Container Creation', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_createNewContainer_when_apiCallSucceeds', async () => {
      // Arrange
      const mockContainerResponse = {
        containerId: 'container_123',
        name: 'Test Container',
        purpose: 'Testing telematic data',
        technicalDescriptors: ['vehicle.fuel_level', 'vehicle.battery_level'],
        createdAt: '2025-01-01T12:00:00Z',
      };

      mockHttpClient.post.mockResolvedValue(createHttpResponse(mockContainerResponse));

      // Act
      const containerId = await (containerManager as any).createContainer('VIN123');

      // Assert
      expect(containerId).toBe('container_123');
      // Name embeds the identifier (issue #108) so subsequent pairings can
      // discover and reuse this container via listContainers().
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/containers',
        {
          name: 'Test Container (VIN123)',
          purpose: 'Testing telematic data',
          technicalDescriptors: [
            'vehicle.fuel_level',
            'vehicle.battery_level',
            'vehicle.location.latitude',
          ],
        },
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        })
      );
    });

    it('should_throwApiError_when_containerCreationFails', async () => {
      // Arrange
      const apiError = new Error('Container creation failed');
      (apiError as any).status = 400;
      mockHttpClient.post.mockRejectedValue(apiError);

      // Act & Assert
      await expect((containerManager as any).createContainer('VIN123')).rejects.toThrow(
        'Container creation failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Container creation failed', apiError, {
        identifier: 'VIN123',
      });
    });

    it('should_includeIdentifierInContainerName_when_creating', async () => {
      // Arrange
      const mockContainerResponse = {
        containerId: 'container_456',
        name: 'Test Container',
        purpose: 'Testing telematic data',
        technicalDescriptors: [],
      };

      mockHttpClient.post.mockResolvedValue(createHttpResponse(mockContainerResponse));

      // Act
      await (containerManager as any).createContainer('VIN456');

      // Assert
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/containers',
        expect.objectContaining({
          name: 'Test Container (VIN456)',
          purpose: 'Testing telematic data',
        }),
        expect.any(Object)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Creating container', {
        identifier: 'VIN456',
        descriptorCount: 3,
      });
    });

    it('should_handleTokenRetrievalFailure_gracefully', async () => {
      // Arrange
      const tokenError = new Error('Token retrieval failed');
      mockGetAccessToken.mockRejectedValue(tokenError);

      // Act & Assert
      await expect((containerManager as any).createContainer('VIN123')).rejects.toThrow(
        'Token retrieval failed'
      );
    });
  });

  describe('Container Retrieval (getOrCreateContainer) - In-Memory Cache Only', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_returnCachedContainer_when_inMemoryCacheHit', async () => {
      // Arrange
      const cachedContainerId = 'cached_container_123';
      (containerManager as any).containerCache.set('VIN123', cachedContainerId);

      // Act
      const containerId = await containerManager.getOrCreateContainer('VIN123');

      // Assert
      expect(containerId).toBe(cachedContainerId);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Using cached container ID', {
        identifier: 'VIN123',
        containerId: cachedContainerId,
      });
    });

    it('should_createNewContainer_when_noCacheEntry', async () => {
      // Arrange
      const newContainerId = 'new_container_789';
      mockHttpClient.post.mockResolvedValue(createHttpResponse({ containerId: newContainerId }));

      // Act
      const containerId = await containerManager.getOrCreateContainer('VIN789');

      // Assert
      expect(containerId).toBe(newContainerId);
      expect(mockHttpClient.post).toHaveBeenCalled();
      expect((containerManager as any).containerCache.get('VIN789')).toBe(newContainerId);
      expect(mockLogger.info).toHaveBeenCalledWith('Container created and cached', {
        identifier: 'VIN789',
        containerId: newContainerId,
      });
    });

    it('should_propagateError_when_containerCreationFails', async () => {
      // Arrange
      mockHttpClient.post.mockRejectedValue(new Error('API failure'));

      // Act & Assert
      await expect(containerManager.getOrCreateContainer('VIN_ERROR')).rejects.toThrow(
        'API failure'
      );
    });
  });

  describe('Container Reuse via List Lookup (issue #108)', () => {
    // Bug: Every pairing attempt called POST /customers/containers, producing
    // duplicate containers on BMW's side and never reusing the one we'd already
    // created for that client. v1.0.18 must list first, match by stable name,
    // and only POST when no match exists.
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_includeIdentifier_when_creatingContainerName', async () => {
      // Arrange - no existing containers, no cache
      mockHttpClient.get.mockResolvedValue(createHttpResponse([]));
      mockHttpClient.post.mockResolvedValue(
        createHttpResponse({ containerId: 'new_container_xyz' })
      );

      // Act
      await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert - POSTed request body must embed the identifier in the name so
      // we can find it again on the next pairing.
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
      const [, body] = mockHttpClient.post.mock.calls[0] as [string, { name: string }, unknown];
      expect(body.name).toContain('HOMEY-6f3c3e2a');
    });

    it('should_reuseExistingContainer_when_listContainsMatchingName', async () => {
      // Arrange - BMW already has a Homey container for this client
      const existing = {
        containerId: 'existing_container_abc',
        name: 'Test Container (HOMEY-6f3c3e2a)',
        purpose: 'Testing telematic data',
        technicalDescriptors: managerOptions.telematicKeys as string[],
      };
      mockHttpClient.get.mockResolvedValue(createHttpResponse([existing]));

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert
      expect(containerId).toBe('existing_container_abc');
      // Must NOT POST a duplicate container.
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      // Must cache the reused container so subsequent calls skip the list too.
      expect(containerManager.getCachedContainerId('HOMEY-6f3c3e2a')).toBe(
        'existing_container_abc'
      );
    });

    it('should_createNewContainer_when_listHasNoMatchingName', async () => {
      // Arrange - BMW has containers, but none look like ours (different
      // managed-app prefix) so we must not touch them.
      const otherContainer = {
        containerId: 'someone_elses_container',
        name: 'Some Other App (foo-bar)',
        purpose: 'Testing telematic data',
        technicalDescriptors: ['vehicle.fuel_level'],
      };
      mockHttpClient.get.mockResolvedValue(createHttpResponse([otherContainer]));
      mockHttpClient.post.mockResolvedValue(
        createHttpResponse({ containerId: 'freshly_created_container' })
      );

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert
      expect(containerId).toBe('freshly_created_container');
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
      // Foreign containers must never be deleted.
      expect(mockHttpClient.delete).not.toHaveBeenCalled();
    });

    it('should_createContainer_when_listEndpointFails', async () => {
      // Arrange - listing failed (e.g. transient API hiccup); we should still
      // be able to fall through to creation rather than block pairing entirely.
      mockHttpClient.get.mockRejectedValue(new Error('Network glitch'));
      mockHttpClient.post.mockResolvedValue(
        createHttpResponse({ containerId: 'created_despite_list_failure' })
      );

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert
      expect(containerId).toBe('created_despite_list_failure');
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    // Issue #108: when BMW returns CU-429 from the list-containers endpoint,
    // the user has already exhausted their 50-request/24h quota. Falling
    // through to createContainer() burns ANOTHER quota request and guarantees
    // a second CU-429. We must short-circuit so pairing fails fast with the
    // accurate rate-limit message and the user's remaining quota is preserved.
    it('should_propagateRateLimitError_when_listContainersHitsCu429', async () => {
      // Arrange - listing returns RateLimitError (BMW's CU-429)
      mockHttpClient.get.mockRejectedValue(
        new RateLimitError(
          'BMW CarData daily rate limit reached (50 requests / 24h per user)',
          3600
        )
      );
      mockHttpClient.post.mockResolvedValue(
        createHttpResponse({ containerId: 'should_not_be_created' })
      );

      // Act
      const error = await containerManager
        .getOrCreateContainer('HOMEY-6f3c3e2a')
        .catch((e: unknown) => e);

      // Assert - rate-limit propagated unchanged; create never attempted
      expect(error).toBeInstanceOf(RateLimitError);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should_listOnlyOnce_when_calledConcurrentlyForSameIdentifier', async () => {
      // Arrange - two pair sessions for the same client race against each other.
      // They must share a single in-flight lookup+create promise so BMW sees
      // at most one POST per client per app lifetime.
      let resolveList: (value: HttpResponse<unknown>) => void = () => {};
      mockHttpClient.get.mockReturnValue(
        new Promise((resolve) => {
          resolveList = resolve as (value: HttpResponse<unknown>) => void;
        })
      );
      mockHttpClient.post.mockResolvedValue(
        createHttpResponse({ containerId: 'race_winner_container' })
      );

      // Act - kick off two concurrent calls
      const p1 = containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');
      const p2 = containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');
      resolveList(createHttpResponse([]));
      const [id1, id2] = await Promise.all([p1, p2]);

      // Assert
      expect(id1).toBe('race_winner_container');
      expect(id2).toBe('race_winner_container');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Orphan Container Cleanup (issue #108 - max containers reached)', () => {
    // Bug: pre-1.0.18 created a fresh container on every pair attempt with the
    // identical literal name 'Test Container' (no identifier suffix), so users
    // who loop-paired filled their BMW per-user container quota. 1.0.20 must
    // proactively delete any container that looks like ours but isn't the one
    // we're currently using — both the legacy unsuffixed shape and any stale
    // suffixed shape from older HOMEY-XXXXXXXX identifiers.
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_deleteLegacyUnsuffixedContainers_when_listingForReuse', async () => {
      // Arrange - one match for current identifier + two pre-1.0.18 orphans
      // with the bare containerName (no suffix).
      const match = {
        containerId: 'current_container',
        name: 'Test Container (HOMEY-6f3c3e2a)',
        purpose: 'p',
        technicalDescriptors: [],
      };
      const legacy1 = {
        containerId: 'legacy_one',
        name: 'Test Container',
        purpose: 'p',
        technicalDescriptors: [],
      };
      const legacy2 = {
        containerId: 'legacy_two',
        name: 'Test Container',
        purpose: 'p',
        technicalDescriptors: [],
      };
      mockHttpClient.get.mockResolvedValue(createHttpResponse([legacy1, match, legacy2]));
      mockHttpClient.delete.mockResolvedValue(createHttpResponse(undefined));

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert - reuse the match, delete the two legacy orphans, never create.
      expect(containerId).toBe('current_container');
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockHttpClient.delete).toHaveBeenCalledTimes(2);
      const deletedIds = mockHttpClient.delete.mock.calls.map((args) => args[0]);
      expect(deletedIds).toEqual(
        expect.arrayContaining([
          expect.stringContaining('legacy_one'),
          expect.stringContaining('legacy_two'),
        ])
      );
      expect(deletedIds.every((u) => !u.includes('current_container'))).toBe(true);
    });

    it('should_deleteStaleSuffixedContainers_when_identifierChanged', async () => {
      // Arrange - no match for current identifier but a stale suffixed orphan
      // from a previous BMW CarData client ID exists.
      const staleOrphan = {
        containerId: 'stale_homey_container',
        name: 'Test Container (HOMEY-deadbeef)',
        purpose: 'p',
        technicalDescriptors: [],
      };
      mockHttpClient.get.mockResolvedValue(createHttpResponse([staleOrphan]));
      mockHttpClient.delete.mockResolvedValue(createHttpResponse(undefined));
      mockHttpClient.post.mockResolvedValue(createHttpResponse({ containerId: 'freshly_created' }));

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert - orphan deleted, then new container created.
      expect(containerId).toBe('freshly_created');
      expect(mockHttpClient.delete).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should_continueCleanup_when_individualDeleteFails', async () => {
      // Arrange - two orphans, first delete fails (e.g. 500); we must still
      // attempt the second one and proceed to the reuse/create step.
      const match = {
        containerId: 'current_container',
        name: 'Test Container (HOMEY-6f3c3e2a)',
        purpose: 'p',
        technicalDescriptors: [],
      };
      const orphan1 = {
        containerId: 'orphan_one',
        name: 'Test Container',
        purpose: 'p',
        technicalDescriptors: [],
      };
      const orphan2 = {
        containerId: 'orphan_two',
        name: 'Test Container',
        purpose: 'p',
        technicalDescriptors: [],
      };
      mockHttpClient.get.mockResolvedValue(createHttpResponse([orphan1, match, orphan2]));
      mockHttpClient.delete
        .mockRejectedValueOnce(new Error('500 server error'))
        .mockResolvedValueOnce(createHttpResponse(undefined));

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert
      expect(containerId).toBe('current_container');
      expect(mockHttpClient.delete).toHaveBeenCalledTimes(2);
    });

    it('should_stopCleanup_when_deleteHitsRateLimit', async () => {
      // Arrange - many orphans; first delete hits CU-429. Cleanup must abort
      // immediately to preserve remaining quota, but the reuse must still
      // succeed (we already have the listed match).
      const match = {
        containerId: 'current_container',
        name: 'Test Container (HOMEY-6f3c3e2a)',
        purpose: 'p',
        technicalDescriptors: [],
      };
      const orphans = Array.from({ length: 5 }, (_, i) => ({
        containerId: `orphan_${i}`,
        name: 'Test Container',
        purpose: 'p',
        technicalDescriptors: [],
      }));
      mockHttpClient.get.mockResolvedValue(createHttpResponse([...orphans, match]));
      mockHttpClient.delete.mockRejectedValueOnce(new RateLimitError('rate limited', 3600));

      // Act
      const containerId = await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert - first delete attempted, then bailed; reuse still wins.
      expect(containerId).toBe('current_container');
      expect(mockHttpClient.delete).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should_logContainerInventory_when_listingDuringResolve', async () => {
      // Diagnostics: every list call must log full inventory so user-submitted
      // logs include the full container set without another API round-trip.
      const containers = [
        {
          containerId: 'c1',
          name: 'Test Container (HOMEY-6f3c3e2a)',
          purpose: 'p',
          technicalDescriptors: [],
        },
        {
          containerId: 'c2',
          name: 'Some Other App (foo)',
          purpose: 'p',
          technicalDescriptors: [],
        },
      ];
      mockHttpClient.get.mockResolvedValue(createHttpResponse(containers));

      // Act
      await containerManager.getOrCreateContainer('HOMEY-6f3c3e2a');

      // Assert - the inventory log must include both containerId+name for each.
      const inventoryCall = mockLogger.info.mock.calls.find(
        (call) => call[0] === 'Container inventory'
      );
      expect(inventoryCall).toBeDefined();
      const ctx = inventoryCall![1] as {
        total: number;
        containers: Array<{ containerId: string; name: string }>;
      };
      expect(ctx.total).toBe(2);
      expect(ctx.containers).toEqual([
        { containerId: 'c1', name: 'Test Container (HOMEY-6f3c3e2a)' },
        { containerId: 'c2', name: 'Some Other App (foo)' },
      ]);
    });
  });

  describe('Cache Management Methods', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
    });

    it('should_setCachedContainerId_when_callerProvides', () => {
      // Act
      containerManager.setCachedContainerId('VIN123', 'container_123');

      // Assert
      expect(containerManager.getCachedContainerId('VIN123')).toBe('container_123');
      expect(mockLogger.debug).toHaveBeenCalledWith('Container ID cached', {
        vin: 'VIN123',
        containerId: 'container_123',
      });
    });

    it('should_getCachedContainerId_when_entryExists', () => {
      // Arrange
      containerManager.setCachedContainerId('VIN456', 'container_456');

      // Act
      const cachedId = containerManager.getCachedContainerId('VIN456');

      // Assert
      expect(cachedId).toBe('container_456');
    });

    it('should_returnUndefined_when_noCacheEntry', () => {
      // Act
      const cachedId = containerManager.getCachedContainerId('NONEXISTENT_VIN');

      // Assert
      expect(cachedId).toBeUndefined();
    });

    it('should_clearCache_when_requested', () => {
      // Arrange
      containerManager.setCachedContainerId('VIN789', 'container_789');
      expect(containerManager.getCachedContainerId('VIN789')).toBe('container_789');

      // Act
      containerManager.clearCache('VIN789');

      // Assert
      expect(containerManager.getCachedContainerId('VIN789')).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('Container cache cleared', { vin: 'VIN789' });
    });

    it('should_clearAllCache_when_requested', () => {
      // Arrange
      containerManager.setCachedContainerId('VIN1', 'container_1');
      containerManager.setCachedContainerId('VIN2', 'container_2');

      // Act
      containerManager.clearAllCache();

      // Assert
      expect(containerManager.getCachedContainerId('VIN1')).toBeUndefined();
      expect(containerManager.getCachedContainerId('VIN2')).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('All container cache cleared');
    });
  });

  describe('Container Listing', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_listContainers_when_apiReturnsArray', async () => {
      // Arrange
      const mockContainers = [
        {
          containerId: 'container_1',
          name: 'Container 1',
          purpose: 'Purpose 1',
          technicalDescriptors: ['key1', 'key2'],
        },
        {
          containerId: 'container_2',
          name: 'Container 2',
          purpose: 'Purpose 2',
          technicalDescriptors: ['key3', 'key4'],
        },
      ];

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockContainers));

      // Act
      const containers = await containerManager.listContainers();

      // Assert
      expect(containers).toEqual(mockContainers);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/containers',
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
        })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Containers listed', { count: 2 });
    });

    it('should_listContainers_when_apiReturnsWrappedObject', async () => {
      // Arrange
      const mockContainers = [
        {
          containerId: 'container_3',
          name: 'Container 3',
          purpose: 'Purpose 3',
          technicalDescriptors: ['key5'],
        },
      ];

      const wrappedResponse = { containers: mockContainers };
      mockHttpClient.get.mockResolvedValue(createHttpResponse(wrappedResponse));

      // Act
      const containers = await containerManager.listContainers();

      // Assert
      expect(containers).toEqual(mockContainers);
      expect(mockLogger.debug).toHaveBeenCalledWith('Containers listed', { count: 1 });
    });

    it('should_returnEmptyArray_when_noContainersFound', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue(createHttpResponse([]));

      // Act
      const containers = await containerManager.listContainers();

      // Assert
      expect(containers).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith('Containers listed', { count: 0 });
    });

    it('should_handleMalformedResponse_gracefully', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue(createHttpResponse(null));

      // Act
      const containers = await containerManager.listContainers();

      // Assert
      expect(containers).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith('Containers listed', { count: 0 });
    });

    it('should_throwError_when_apiCallFails', async () => {
      // Arrange
      const apiError = new Error('Failed to list containers');
      mockHttpClient.get.mockRejectedValue(apiError);

      // Act & Assert
      await expect(containerManager.listContainers()).rejects.toThrow('Failed to list containers');
    });
  });

  describe('Container Deletion', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_deleteContainer_when_apiCallSucceeds', async () => {
      // Arrange
      const containerId = 'container_to_delete';
      (containerManager as any).containerCache.set('VIN123', containerId);
      (containerManager as any).containerCache.set('VIN456', 'other_container');
      mockHttpClient.delete.mockResolvedValue(createHttpResponse({}));

      // Act
      await containerManager.deleteContainer(containerId);

      // Assert
      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/containers/container_to_delete',
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
        })
      );
      expect((containerManager as any).containerCache.has('VIN123')).toBe(false);
      expect((containerManager as any).containerCache.get('VIN456')).toBe('other_container');
      expect(mockLogger.info).toHaveBeenCalledWith('Container deleted', { containerId });
    });

    it('should_removeFromCacheOnly_when_containerFound', async () => {
      // Arrange
      const containerId = 'cached_container';
      (containerManager as any).containerCache.set('VIN_CACHED', containerId);
      mockHttpClient.delete.mockResolvedValue(createHttpResponse({}));

      // Act
      await containerManager.deleteContainer(containerId);

      // Assert
      expect((containerManager as any).containerCache.has('VIN_CACHED')).toBe(false);
      // Note: No persistent storage cleanup in simplified architecture
    });

    it('should_throwError_when_apiCallFails', async () => {
      // Arrange
      const containerId = 'nonexistent_container';
      const deleteError = new ApiError('Container not found', 500); // Non-404 error
      mockHttpClient.delete.mockRejectedValue(deleteError);

      // Act & Assert
      await expect(containerManager.deleteContainer(containerId)).rejects.toThrow(
        'Container not found'
      );
    });

    it('should_handleNotFoundGracefully_when_containerAlreadyDeleted', async () => {
      // Arrange
      const containerId = 'already_deleted_container';
      const notFoundError = new ApiError('Container not found', 404);
      mockHttpClient.delete.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(containerManager.deleteContainer(containerId)).resolves.not.toThrow();
      expect(mockLogger.debug).toHaveBeenCalledWith('Container already deleted', { containerId });
    });
  });

  describe('Container Validation', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
      mockGetAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_validateContainer_when_allKeysPresent', async () => {
      // Arrange
      const containerId = 'valid_container';
      const mockContainer = {
        containerId,
        name: 'Valid Container',
        purpose: 'Testing',
        technicalDescriptors: [
          'vehicle.fuel_level',
          'vehicle.battery_level',
          'vehicle.location.latitude',
        ],
      };

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockContainer));

      // Act
      const result = await containerManager.validateContainer(containerId);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.container).toEqual(mockContainer);
      expect(result.missingKeys).toBeUndefined();
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/containers/valid_container',
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Container validation successful', {
        containerId,
        keyCount: 3,
      });
    });

    it('should_validateContainer_when_someKeysAreMissing', async () => {
      // Arrange
      const containerId = 'incomplete_container';
      const mockContainer = {
        containerId,
        name: 'Incomplete Container',
        purpose: 'Testing',
        technicalDescriptors: ['vehicle.fuel_level'], // Missing 2 keys
      };

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockContainer));

      // Act
      const result = await containerManager.validateContainer(containerId);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.container).toEqual(mockContainer);
      expect(result.missingKeys).toEqual(['vehicle.battery_level', 'vehicle.location.latitude']);
      expect(mockLogger.warn).toHaveBeenCalledWith('Container missing required keys', {
        containerId,
        missingCount: 2,
      });
    });

    it('should_handleContainerWithNoKeys', async () => {
      // Arrange
      const containerId = 'empty_container';
      const mockContainer = {
        containerId,
        name: 'Empty Container',
        purpose: 'Testing',
        technicalDescriptors: [],
      };

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockContainer));

      // Act
      const result = await containerManager.validateContainer(containerId);

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.missingKeys).toEqual([
        'vehicle.fuel_level',
        'vehicle.battery_level',
        'vehicle.location.latitude',
      ]);
    });

    it('should_throwApiError_when_containerNotFound', async () => {
      // Arrange
      const containerId = 'nonexistent_container';
      const notFoundError = new ApiError('Container not found', 404);
      mockHttpClient.get.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(containerManager.validateContainer(containerId)).rejects.toThrow(ApiError);
      await expect(containerManager.validateContainer(containerId)).rejects.toThrow(
        'Container not found'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Container not found: nonexistent_container');
    });

    it('should_propagateOtherErrors_during_validation', async () => {
      // Arrange
      const containerId = 'error_container';
      const networkError = new Error('Network failure');
      mockHttpClient.get.mockRejectedValue(networkError);

      // Act & Assert
      await expect(containerManager.validateContainer(containerId)).rejects.toThrow(
        'Network failure'
      );
    });
  });

  describe('Error Handling & Edge Cases', () => {
    beforeEach(() => {
      containerManager = new ContainerManager(managerOptions);
    });

    it('should_handleTokenRetrievalFailure_in_allMethods', async () => {
      // Arrange
      const tokenError = new Error('Token expired');
      mockGetAccessToken.mockRejectedValue(tokenError);

      // Act & Assert
      await expect(containerManager.getOrCreateContainer('VIN123')).rejects.toThrow(
        'Token expired'
      );
      await expect(containerManager.listContainers()).rejects.toThrow('Token expired');
      await expect(containerManager.deleteContainer('container_123')).rejects.toThrow(
        'Token expired'
      );
      await expect(containerManager.validateContainer('container_123')).rejects.toThrow(
        'Token expired'
      );
    });

    it('should_handleNetworkErrors_gracefully', async () => {
      // Arrange
      mockGetAccessToken.mockResolvedValue('valid_token');
      const networkError = new Error('ECONNREFUSED');
      mockHttpClient.get.mockRejectedValue(networkError);
      mockHttpClient.post.mockRejectedValue(networkError);
      mockHttpClient.delete.mockRejectedValue(networkError);

      // Act & Assert
      await expect(containerManager.listContainers()).rejects.toThrow('ECONNREFUSED');
      await expect(containerManager.deleteContainer('container_123')).rejects.toThrow(
        'ECONNREFUSED'
      );
      await expect(containerManager.validateContainer('container_123')).rejects.toThrow(
        'ECONNREFUSED'
      );
    });

    it('should_logDebugInfo_when_operationsPerformed', async () => {
      // Arrange
      mockGetAccessToken.mockResolvedValue('valid_token');
      mockHttpClient.get.mockResolvedValue(createHttpResponse([]));

      // Act
      await containerManager.listContainers();

      // Assert
      expect(mockLogger.debug).toHaveBeenCalledWith('Listing containers');
      expect(mockLogger.debug).toHaveBeenCalledWith('Containers listed', { count: 0 });
    });

    it('should_buildHeadersCorrectly_with_configuration', () => {
      // Arrange
      const accessToken = 'test_token_123';

      // Act
      const headers = (containerManager as any).buildHeaders(accessToken);

      // Assert
      expect(headers).toEqual({
        Authorization: 'Bearer test_token_123',
        'x-version': 'v1',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
    });

    it('should_handleCacheManipulation_correctly', () => {
      // Arrange
      const cache = (containerManager as any).containerCache;

      // Act
      cache.set('VIN1', 'container1');
      cache.set('VIN2', 'container2');

      // Assert
      expect(cache.get('VIN1')).toBe('container1');
      expect(cache.get('VIN2')).toBe('container2');
      expect(cache.has('VIN3')).toBe(false);

      cache.delete('VIN1');
      expect(cache.has('VIN1')).toBe(false);
      expect(cache.get('VIN2')).toBe('container2');
    });
  });
});
