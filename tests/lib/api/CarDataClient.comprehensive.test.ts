/**
 * Comprehensive Unit Tests for CarDataClient
 *
 * Tests BMW CarData API implementation to improve coverage from 2.72% to 80%+:
 * - Constructor and initialization
 * - Authentication flows
 * - Vehicle listing
 * - Error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CarDataClient, type CarDataClientOptions } from '../../../lib/api/CarDataClient';
import type { IAuthProvider } from '../../../lib/auth/IAuthProvider';
import type { IHttpClient, HttpResponse } from '../../../lib/http/IHttpClient';
import type { ILogger } from '../../../lib/types/ILogger';
import { AuthenticationError } from '../../../lib/types/errors';

describe('CarDataClient - Comprehensive Tests', () => {
  let carDataClient: CarDataClient;
  let mockAuthProvider: jest.Mocked<IAuthProvider>;
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let mockLogger: jest.Mocked<ILogger>;
  let clientOptions: CarDataClientOptions;

  // Helper function to create HTTP responses
  const createHttpResponse = <T>(data: T, status = 200): HttpResponse<T> => ({
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    data,
  });

  beforeEach(() => {
    // Mock auth provider
    mockAuthProvider = {
      requestDeviceCode: jest.fn(),
      pollForTokens: jest.fn(),
      refreshTokens: jest.fn(),
      getValidAccessToken: jest.fn(),
      getToken: jest.fn(),
      isAccessTokenExpired: jest.fn(),
      isRefreshTokenExpired: jest.fn(),
      revokeTokens: jest.fn(),
    } as any;

    // Mock HTTP client
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
    } as any;

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

    // Default client options
    clientOptions = {
      authProvider: mockAuthProvider,
      httpClient: mockHttpClient,
      logger: mockLogger,
      baseUrl: 'https://api-cardata.bmwgroup.com',
      apiVersion: 'v1',
    };
  });

  describe('Constructor & Initialization', () => {
    it('should_createClient_when_allOptionsProvided', () => {
      // Act
      const client = new CarDataClient(clientOptions);

      // Assert
      expect(client).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('CarDataClient initialized', {
        baseUrl: 'https://api-cardata.bmwgroup.com',
        apiVersion: 'v1',
      });
    });

    it('should_useDefaults_when_optionalParametersOmitted', () => {
      // Arrange
      const minimalOptions: CarDataClientOptions = {
        authProvider: mockAuthProvider,
        httpClient: mockHttpClient,
      };

      // Act
      const client = new CarDataClient(minimalOptions);

      // Assert
      expect(client).toBeDefined();
      // No logger debug call expected when logger is undefined
    });

    it('should_useCustomValues_when_baseUrlAndVersionProvided', () => {
      // Arrange
      const customOptions: CarDataClientOptions = {
        authProvider: mockAuthProvider,
        httpClient: mockHttpClient,
        logger: mockLogger,
        baseUrl: 'https://custom-api.example.com',
        apiVersion: 'v2',
      };

      // Act
      const client = new CarDataClient(customOptions);

      // Assert
      expect(client).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('CarDataClient initialized', {
        baseUrl: 'https://custom-api.example.com',
        apiVersion: 'v2',
      });
    });

    it('should_implementIVehicleClient_interface', () => {
      // Act
      const client = new CarDataClient(clientOptions);

      // Assert
      expect(typeof client.authenticate).toBe('function');
      expect(typeof client.getVehicles).toBe('function');
      expect(typeof client.getVehicleStatus).toBe('function');
      expect(typeof client.getRawTelematicData).toBe('function');
      expect(typeof client.isAuthenticated).toBe('function');
      expect(typeof client.refreshAuthentication).toBe('function');
      expect(typeof client.disconnect).toBe('function');
    });
  });

  describe('Authentication Flow', () => {
    beforeEach(() => {
      carDataClient = new CarDataClient(clientOptions);
    });

    it('should_authenticate_when_validTokenAvailable', async () => {
      // Arrange
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_access_token');

      // Act
      await carDataClient.authenticate();

      // Assert
      expect(mockAuthProvider.getValidAccessToken).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Starting authentication flow');
      expect(mockLogger.info).toHaveBeenCalledWith('Authentication successful');
    });

    it('should_throwAuthenticationError_when_authProviderFails', async () => {
      // Arrange
      const authError = new AuthenticationError('Token retrieval failed', 'token_error');
      mockAuthProvider.getValidAccessToken.mockRejectedValue(authError);

      // Act & Assert
      await expect(carDataClient.authenticate()).rejects.toThrow(AuthenticationError);
      await expect(carDataClient.authenticate()).rejects.toThrow('Token retrieval failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Authentication failed', authError);
    });

    it('should_returnTrue_when_accessTokenNotExpired', () => {
      mockAuthProvider.isAccessTokenExpired.mockReturnValue(false);

      expect(carDataClient.isAuthenticated()).toBe(true);
    });

    it('should_returnFalse_when_accessTokenExpiredOrMissing', () => {
      mockAuthProvider.isAccessTokenExpired.mockReturnValue(true);

      expect(carDataClient.isAuthenticated()).toBe(false);
    });

    it('should_refreshTokens_when_refreshAuthenticationCalled', async () => {
      // Arrange
      mockAuthProvider.getValidAccessToken.mockResolvedValue('new_token');

      // Act
      await carDataClient.refreshAuthentication();

      // Assert
      expect(mockAuthProvider.getValidAccessToken).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Refreshing authentication');
      expect(mockLogger.info).toHaveBeenCalledWith('Authentication refreshed successfully');
    });

    it('should_propagateError_when_refreshFails', async () => {
      // Arrange
      const refreshError = new Error('Token refresh failed');
      mockAuthProvider.getValidAccessToken.mockRejectedValue(refreshError);

      // Act & Assert
      await expect(carDataClient.refreshAuthentication()).rejects.toThrow(AuthenticationError);
      expect(mockLogger.error).toHaveBeenCalledWith('Authentication refresh failed', refreshError);
    });

    it('should_revokeTokens_when_disconnectCalled', async () => {
      // Arrange
      mockAuthProvider.revokeTokens.mockResolvedValue();

      // Act
      await carDataClient.disconnect();

      // Assert
      expect(mockAuthProvider.revokeTokens).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting client');
      expect(mockLogger.info).toHaveBeenCalledWith('Client disconnected successfully');
    });

    it('should_handleDisconnectError_gracefully', async () => {
      // Arrange
      const disconnectError = new Error('Disconnect failed');
      mockAuthProvider.revokeTokens.mockRejectedValue(disconnectError);

      // Act - should not throw, error is logged but swallowed
      await carDataClient.disconnect();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith('Error during disconnect', {
        error: disconnectError,
      });
    });
  });

  describe('Vehicle Listing', () => {
    beforeEach(() => {
      carDataClient = new CarDataClient(clientOptions);
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_fetchVehicles_when_primaryMappingsExist', async () => {
      // Arrange
      const mockMappingsResponse = [
        { vin: 'VIN123', mappingType: 'PRIMARY', mappedSince: '2023-01-01' },
        { vin: 'VIN456', mappingType: 'SECONDARY', mappedSince: '2023-01-02' }, // Should be filtered out
      ];

      const mockBasicDataResponse = {
        brand: 'BMW',
        modelName: 'X5',
        driveTrain: 'BEV',
        series: 'X',
        numberOfDoors: 4,
      };

      mockHttpClient.get
        .mockResolvedValueOnce(createHttpResponse(mockMappingsResponse))
        .mockResolvedValueOnce(createHttpResponse(mockBasicDataResponse));

      // Act
      const vehicles = await carDataClient.getVehicles();

      // Assert
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0].vin).toBe('VIN123');
      expect(vehicles[0].brand).toBe('BMW');
      expect(vehicles[0].model).toBe('X5');
      expect(vehicles[0].driveTrain).toBe('ELECTRIC');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/vehicles/mappings',
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Fetching vehicle list');
    });

    it('should_returnEmptyArray_when_noVehicleMappings', async () => {
      // Arrange
      mockHttpClient.get.mockResolvedValue(createHttpResponse([]));

      // Act
      const vehicles = await carDataClient.getVehicles();

      // Assert
      expect(vehicles).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('Retrieved 0 vehicles');
    });

    it('should_filterSecondaryMappings_when_mixedMappingTypes', async () => {
      // Arrange
      const mockMappingsResponse = [
        { vin: 'VIN123', mappingType: 'SECONDARY', mappedSince: '2023-01-01' },
        { vin: 'VIN456', mappingType: 'SECONDARY', mappedSince: '2023-01-02' },
      ];

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockMappingsResponse));

      // Act
      const vehicles = await carDataClient.getVehicles();

      // Assert
      expect(vehicles).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('Retrieved 0 vehicles');
    });

    it('should_throwError_when_401Response', async () => {
      // Arrange
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      mockHttpClient.get.mockRejectedValue(authError);

      // Act & Assert
      await expect(carDataClient.getVehicles()).rejects.toThrow('Unauthorized');
      expect(mockLogger.error).not.toHaveBeenCalled(); // No error log in getVehicles
    });

    it('should_throwError_when_httpClientFails', async () => {
      // Arrange
      const networkError = new Error('Network failure');
      mockHttpClient.get.mockRejectedValue(networkError);

      // Act & Assert
      await expect(carDataClient.getVehicles()).rejects.toThrow('Network failure');
    });

    it('should_mapDriveTrainTypes_correctly', async () => {
      // Arrange
      const mockMappingsResponse = [
        { vin: 'VIN_BEV', mappingType: 'PRIMARY', mappedSince: '2023-01-01' },
        { vin: 'VIN_PHEV', mappingType: 'PRIMARY', mappedSince: '2023-01-02' },
        { vin: 'VIN_ICE', mappingType: 'PRIMARY', mappedSince: '2023-01-03' },
      ];

      const mockBasicDataBEV = { driveTrain: 'BEV', brand: 'BMW', modelName: 'iX' };
      const mockBasicDataPHEV = { driveTrain: 'PHEV', brand: 'BMW', modelName: 'X5' };
      const mockBasicDataICE = { driveTrain: 'ICE', brand: 'BMW', modelName: '320i' };

      mockHttpClient.get
        .mockResolvedValueOnce(createHttpResponse(mockMappingsResponse))
        .mockResolvedValueOnce(createHttpResponse(mockBasicDataBEV))
        .mockResolvedValueOnce(createHttpResponse(mockBasicDataPHEV))
        .mockResolvedValueOnce(createHttpResponse(mockBasicDataICE));

      // Act
      const vehicles = await carDataClient.getVehicles();

      // Assert
      expect(vehicles).toHaveLength(3);
      expect(vehicles[0].driveTrain).toBe('ELECTRIC');
      expect(vehicles[1].driveTrain).toBe('PLUGIN_HYBRID');
      expect(vehicles[2].driveTrain).toBe('COMBUSTION');
    });
  });

  describe('Vehicle Status', () => {
    beforeEach(() => {
      carDataClient = new CarDataClient(clientOptions);
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_getVehicleStatus_when_basicDataOnly', async () => {
      // Arrange
      const mockBasicData = {
        brand: 'BMW',
        modelName: 'X5',
        driveTrain: 'BEV',
        series: 'X',
      };

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockBasicData));

      // Act
      const status = await carDataClient.getVehicleStatus('VIN123');

      // Assert
      expect(status.vin).toBe('VIN123');
      expect(status.driveTrain).toBe('ELECTRIC');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/vehicles/VIN123/basicData',
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
        })
      );
    });

    it('should_throwError_when_404Response', async () => {
      // Arrange
      const notFoundError = new Error('Not Found');
      (notFoundError as any).status = 404;
      mockHttpClient.get.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(carDataClient.getVehicleStatus('INVALID_VIN')).rejects.toThrow('Not Found');
    });

    it('should_throwError_when_401Response', async () => {
      // Arrange
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      mockHttpClient.get.mockRejectedValue(authError);

      // Act & Assert
      await expect(carDataClient.getVehicleStatus('VIN123')).rejects.toThrow('Unauthorized');
    });

    it('should_handleMissingDriveTrain_gracefully', async () => {
      // Arrange
      const mockBasicData = { brand: 'BMW', modelName: 'X5' }; // No driveTrain

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockBasicData));

      // Act
      const status = await carDataClient.getVehicleStatus('VIN123');

      // Assert
      expect(status.driveTrain).toBe('UNKNOWN');
    });
  });

  describe('Raw Telematic Data', () => {
    beforeEach(() => {
      carDataClient = new CarDataClient(clientOptions);
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_access_token');
    });

    it('should_getRawTelematicData_when_validRequest', async () => {
      // Arrange
      const mockTelematicResponse = {
        telematicData: {
          'vehicle.fuel_level': {
            value: '75',
            unit: '%',
            timestamp: '2025-01-01T12:00:00Z',
          },
          'vehicle.battery_level': {
            value: '80',
            unit: '%',
            timestamp: '2025-01-01T12:00:00Z',
          },
        },
      };

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockTelematicResponse));

      // Act
      const data = await carDataClient.getRawTelematicData('VIN123', 'container456');

      // Assert
      expect(data).toEqual({
        'vehicle.fuel_level': {
          value: 75,
          unit: '%',
          timestamp: '2025-01-01T12:00:00Z',
          source: 'api',
        },
        'vehicle.battery_level': {
          value: 80,
          unit: '%',
          timestamp: '2025-01-01T12:00:00Z',
          source: 'api',
        },
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api-cardata.bmwgroup.com/customers/vehicles/VIN123/telematicData?containerId=container456',
        expect.objectContaining({
          Authorization: 'Bearer valid_access_token',
          'x-version': 'v1',
        })
      );
    });

    it('should_filterInvalidData_when_nullValues', async () => {
      // Arrange
      const mockTelematicResponse = {
        telematicData: {
          valid_key: { value: '75', unit: '%', timestamp: '2025-01-01T12:00:00Z' },
          null_value: { value: null, unit: '%', timestamp: '2025-01-01T12:00:00Z' },
          null_timestamp: { value: '80', unit: '%', timestamp: null },
          all_null: { value: null, unit: null, timestamp: null },
        },
      };

      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockTelematicResponse));

      // Act
      const data = await carDataClient.getRawTelematicData('VIN123', 'container456');

      // Assert
      expect(data).toEqual({
        valid_key: {
          value: 75,
          unit: '%',
          timestamp: '2025-01-01T12:00:00Z',
          source: 'api',
        },
      });
    });

    it('should_handleEmptyResponse_gracefully', async () => {
      // Arrange
      const mockTelematicResponse = { telematicData: {} };
      mockHttpClient.get.mockResolvedValue(createHttpResponse(mockTelematicResponse));

      // Act
      const data = await carDataClient.getRawTelematicData('VIN123', 'container456');

      // Assert
      expect(data).toEqual({});
    });

    it('should_throwError_when_401Response', async () => {
      // Arrange
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      mockHttpClient.get.mockRejectedValue(authError);

      // Act & Assert
      await expect(carDataClient.getRawTelematicData('VIN123', 'container456')).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('should_throwError_when_404Response', async () => {
      // Arrange
      const notFoundError = new Error('Not Found');
      (notFoundError as any).status = 404;
      mockHttpClient.get.mockRejectedValue(notFoundError);

      // Act & Assert
      await expect(carDataClient.getRawTelematicData('VIN123', 'container456')).rejects.toThrow(
        'Not Found'
      );
    });
  });

  describe('Error Handling & Edge Cases', () => {
    beforeEach(() => {
      carDataClient = new CarDataClient(clientOptions);
    });

    it('should_throwError_when_getAccessTokenFails', async () => {
      // Arrange
      mockAuthProvider.getValidAccessToken.mockRejectedValue(new Error('Token retrieval failed'));

      // Act & Assert
      await expect(carDataClient.getVehicles()).rejects.toThrow('Token retrieval failed');
    });

    it('should_handleRateLimitError_when_429Response', async () => {
      // Arrange
      const rateLimitError = new Error('Too Many Requests');
      (rateLimitError as any).status = 429;
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_token');
      mockHttpClient.get.mockRejectedValue(rateLimitError);

      // Act & Assert
      await expect(carDataClient.getVehicles()).rejects.toThrow('Too Many Requests');
    });

    it('should_handleNetworkError_gracefully', async () => {
      // Arrange
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_token');
      mockHttpClient.get.mockRejectedValue(new Error('ECONNREFUSED'));

      // Act & Assert
      await expect(carDataClient.getVehicles()).rejects.toThrow('ECONNREFUSED');
    });

    it('should_logRequests_when_loggerProvided', async () => {
      // Arrange
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_token');
      mockHttpClient.get.mockResolvedValue(createHttpResponse([]));

      // Act
      await carDataClient.getVehicles();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Fetching vehicle list');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'CarDataClient initialized',
        expect.any(Object)
      );
    });

    it('should_includeVinInLogging_when_vehicleSpecificOperations', async () => {
      // Arrange
      mockAuthProvider.getValidAccessToken.mockResolvedValue('valid_token');
      mockHttpClient.get.mockResolvedValue(createHttpResponse({ driveTrain: 'BEV' }));

      // Act
      await carDataClient.getVehicleStatus('VIN123');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Fetching vehicle status', {
        vin: 'VIN123',
        hasContainer: false,
      });
    });
  });
});
