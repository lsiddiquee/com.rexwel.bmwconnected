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
import { ApiError } from '../../../lib/types/errors';

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
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/containers',
        {
          name: 'Test Container',
          purpose: 'Testing telematic data',
          technicalDescriptors: ['vehicle.fuel_level', 'vehicle.battery_level', 'vehicle.location.latitude'],
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
      await expect((containerManager as any).createContainer('VIN123')).rejects.toThrow('Container creation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Container creation failed', apiError, { identifier: 'VIN123' });
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
          name: 'Test Container',
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
      await expect((containerManager as any).createContainer('VIN123')).rejects.toThrow('Token retrieval failed');
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
      await expect(containerManager.getOrCreateContainer('VIN_ERROR')).rejects.toThrow('API failure');
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
      await expect(containerManager.deleteContainer(containerId)).rejects.toThrow('Container not found');
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
        technicalDescriptors: ['vehicle.fuel_level', 'vehicle.battery_level', 'vehicle.location.latitude'],
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
      expect(result.missingKeys).toEqual(['vehicle.fuel_level', 'vehicle.battery_level', 'vehicle.location.latitude']);
    });

    it('should_throwApiError_when_containerNotFound', async () => {
      // Arrange
      const containerId = 'nonexistent_container';
      const notFoundError = new ApiError('Container not found', 404);
      mockHttpClient.get.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(containerManager.validateContainer(containerId)).rejects.toThrow(ApiError);
      await expect(containerManager.validateContainer(containerId)).rejects.toThrow('Container not found');
      expect(mockLogger.error).toHaveBeenCalledWith('Container not found: nonexistent_container');
    });

    it('should_propagateOtherErrors_during_validation', async () => {
      // Arrange
      const containerId = 'error_container';
      const networkError = new Error('Network failure');
      mockHttpClient.get.mockRejectedValue(networkError);

      // Act & Assert
      await expect(containerManager.validateContainer(containerId)).rejects.toThrow('Network failure');
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
      await expect(containerManager.getOrCreateContainer('VIN123')).rejects.toThrow('Token expired');
      await expect(containerManager.listContainers()).rejects.toThrow('Token expired');
      await expect(containerManager.deleteContainer('container_123')).rejects.toThrow('Token expired');
      await expect(containerManager.validateContainer('container_123')).rejects.toThrow('Token expired');
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
      await expect(containerManager.deleteContainer('container_123')).rejects.toThrow('ECONNREFUSED');
      await expect(containerManager.validateContainer('container_123')).rejects.toThrow('ECONNREFUSED');
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