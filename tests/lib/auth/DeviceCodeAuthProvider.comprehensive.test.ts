/**
 * Comprehensive Unit Tests for DeviceCodeAuthProvider
 *
 * Tests OAuth 2.0 Device Code Flow implementation to improve coverage from 3.22% to 80%+
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  DeviceCodeAuthProvider,
  type DeviceCodeAuthOptions,
} from '../../../lib/auth/DeviceCodeAuthProvider';
import type { ITokenStore } from '../../../lib/types/ITokenStore';
import type { ILogger } from '../../../lib/types/ILogger';
import type { DeviceCodeResponse, AuthToken } from '../../../lib/models';
import { PkceGenerator } from '../../../lib/auth/PkceGenerator';
import { AuthenticationError, NetworkError } from '../../../lib/types/errors';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
(global as any).fetch = mockFetch;

describe('DeviceCodeAuthProvider - Comprehensive Tests', () => {
  let authProvider: DeviceCodeAuthProvider;
  let mockTokenStore: jest.Mocked<ITokenStore>;
  let mockLogger: jest.Mocked<ILogger>;
  let clientId: string;
  let options: DeviceCodeAuthOptions;

  // Helper function to create fetch responses
  const createFetchResponse = (data: any, status = 200): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Headers(),
      json: async () => data,
      text: async () => JSON.stringify(data),
    }) as Response;

  beforeEach(() => {
    // Mock token store
    mockTokenStore = {
      storeToken: jest.fn(),
      retrieveToken: jest.fn(),
      deleteToken: jest.fn(),
      hasToken: jest.fn(),
    } as jest.Mocked<ITokenStore>;

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
    };

    clientId = 'test-client-id-gcid';
    options = {
      scopes: 'vehicle:read vehicle:write',
      deviceCodeUrl: 'https://test.auth.com/device',
      tokenUrl: 'https://test.auth.com/token',
      timeout: 60000,
      pollInterval: 1000,
      logger: mockLogger,
    };

    mockFetch.mockReset();
  });

  describe('Constructor & Initialization', () => {
    it('should_createProvider_when_allOptionsProvided', () => {
      // Act
      const provider = new DeviceCodeAuthProvider(mockTokenStore, clientId, options);

      // Assert
      expect(provider).toBeDefined();
    });

    it('should_useDefaults_when_minimalOptionsProvided', () => {
      // Act
      const provider = new DeviceCodeAuthProvider(mockTokenStore, clientId);

      // Assert
      expect(provider).toBeDefined();
    });
  });

  describe('Device Code Request Flow', () => {
    beforeEach(() => {
      authProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, options);
      jest.spyOn(PkceGenerator, 'generate').mockReturnValue({
        codeVerifier: 'test_verifier',
        codeChallenge: 'test_challenge',
        codeChallengeMethod: 'S256',
      });
    });

    it('should_requestDeviceCode_when_validRequest', async () => {
      // Arrange - API response format uses snake_case
      const mockApiResponse = {
        device_code: 'device_12345',
        user_code: 'ABCD-1234',
        verification_uri: 'https://auth.bmwgroup.com/device',
        verification_uri_complete: 'https://auth.bmwgroup.com/device?user_code=ABCD-1234',
        expires_in: 900,
        interval: 5,
      };

      // Expected DeviceCodeResponse format uses camelCase
      const expectedResponse: DeviceCodeResponse = {
        deviceCode: 'device_12345',
        userCode: 'ABCD-1234',
        verificationUrl: 'https://auth.bmwgroup.com/device',
        verificationUrlComplete: 'https://auth.bmwgroup.com/device?user_code=ABCD-1234',
        expiresIn: 900,
        interval: 5,
      };

      mockFetch.mockResolvedValue(createFetchResponse(mockApiResponse));

      // Act
      const result = await authProvider.requestDeviceCode();

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.auth.com/device',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('should_throwAuthenticationError_when_400Response', async () => {
      // Arrange
      const errorResponse = { error: 'invalid_request', error_description: 'Missing client_id' };
      mockFetch.mockResolvedValue(createFetchResponse(errorResponse, 400));

      // Act & Assert
      await expect(authProvider.requestDeviceCode()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Token Polling Mechanism', () => {
    beforeEach(() => {
      authProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, options);
      jest.spyOn(PkceGenerator, 'generate').mockReturnValue({
        codeVerifier: 'test_verifier',
        codeChallenge: 'test_challenge',
        codeChallengeMethod: 'S256',
      });
    });

    it('should_pollForTokens_when_authorizationPending', async () => {
      // Arrange
      const deviceCode = 'device_12345';
      const mockTokenResponse = {
        gcid: 'test-gcid-12345',
        access_token: 'access_token_12345',
        refresh_token: 'refresh_token_12345',
        id_token: 'id_token_12345',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'vehicle:read vehicle:write',
      };

      // First, simulate a successful device code request to set up PKCE challenge
      const mockApiResponse = {
        device_code: deviceCode,
        user_code: 'ABCD-1234',
        verification_uri: 'https://auth.bmwgroup.com/device',
        expires_in: 900,
        interval: 5,
      };

      // Mock the device code request call to set up PKCE challenge
      mockFetch.mockResolvedValueOnce(createFetchResponse(mockApiResponse));
      await authProvider.requestDeviceCode();

      // Now set up the polling responses - first call returns "authorization_pending", second call returns tokens
      mockFetch
        .mockResolvedValueOnce(
          createFetchResponse(
            {
              error: 'authorization_pending',
              error_description: 'User has not completed authorization',
            },
            400
          )
        )
        .mockResolvedValueOnce(createFetchResponse(mockTokenResponse));

      // Act
      const result = await authProvider.pollForTokens(deviceCode);

      // Assert
      expect(result.accessToken).toBe('access_token_12345');
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 for requestDeviceCode + 2 for polling
      expect(mockTokenStore.storeToken).toHaveBeenCalledWith(expect.any(Object), clientId);
    });

    it('should_throwAuthenticationError_when_accessDenied', async () => {
      // Arrange
      const deviceCode = 'device_12345';

      // First, simulate a successful device code request to set up PKCE challenge
      const mockApiResponse = {
        device_code: deviceCode,
        user_code: 'ABCD-1234',
        verification_uri: 'https://auth.bmwgroup.com/device',
        expires_in: 900,
        interval: 5,
      };

      mockFetch.mockResolvedValueOnce(createFetchResponse(mockApiResponse));
      await authProvider.requestDeviceCode();

      // Now mock the access denied response
      mockFetch.mockResolvedValue(
        createFetchResponse(
          {
            error: 'access_denied',
            error_description: 'User denied the request',
          },
          400
        )
      );

      // Act & Assert
      await expect(authProvider.pollForTokens(deviceCode)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Token Management', () => {
    beforeEach(() => {
      authProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, options);
    });

    it('should_getValidAccessToken_when_tokenNotExpired', async () => {
      // Arrange
      const validToken: AuthToken = {
        gcid: 'test-gcid',
        accessToken: 'valid_access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };
      mockTokenStore.retrieveToken.mockResolvedValue(validToken);

      // Act
      const result = await authProvider.getValidAccessToken();

      // Assert
      expect(result).toBe(validToken.accessToken);
      expect(mockTokenStore.retrieveToken).toHaveBeenCalledWith(clientId);
    });

    it('should_throwAuthenticationError_when_noTokenStored', async () => {
      // Arrange
      mockTokenStore.retrieveToken.mockResolvedValue(undefined);

      // Act & Assert
      await expect(authProvider.getValidAccessToken()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Token Revocation', () => {
    beforeEach(() => {
      authProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, options);
    });

    it('should_revokeTokens_when_revokeTokensCalled', async () => {
      // Arrange
      const storedToken: AuthToken = {
        gcid: 'test-gcid',
        accessToken: 'access_token',
        refreshToken: 'refresh_token_12345',
        idToken: 'id_token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600000,
      };
      mockTokenStore.retrieveToken.mockResolvedValue(storedToken);
      mockFetch.mockResolvedValue(createFetchResponse({}));

      // Act
      await authProvider.revokeTokens();

      // Assert
      expect(mockTokenStore.deleteToken).toHaveBeenCalledWith(clientId);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      authProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, options);
    });

    it('should_handleTokenStoreErrors_gracefully', async () => {
      // Arrange
      mockTokenStore.retrieveToken.mockRejectedValue(new Error('Storage error'));

      // Act & Assert
      await expect(authProvider.getValidAccessToken()).rejects.toThrow('Storage error');
    });

    it('should_throwNetworkError_when_fetchFails', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));

      // Act & Assert
      await expect(authProvider.requestDeviceCode()).rejects.toThrow(NetworkError);
    });
  });
});
