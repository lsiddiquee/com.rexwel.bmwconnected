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
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: expect.any(URLSearchParams),
        })
      );

      // Verify body parameters include response_type
      const callArgs = mockFetch.mock.calls[0];
      const requestInit = callArgs[1];
      expect(requestInit).toBeDefined();
      const bodyParams = requestInit?.body as URLSearchParams;
      expect(bodyParams.get('response_type')).toBe('device_code');
      expect(bodyParams.get('client_id')).toBe('test-client-id-gcid');
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

    // Regression: issue #106 - if the token endpoint returns a non-2xx response without
    // an `error` field (e.g. unexpected HTML or generic 5xx JSON body), the previous
    // implementation called `errorCode.toUpperCase()` on `undefined` and threw a
    // TypeError, which was then surfaced as "Failed to poll for tokens" with no detail.
    it('should_throwAuthenticationError_when_pollResponseHasNoErrorField', async () => {
      // Arrange - set up PKCE via successful device code request
      const deviceCode = 'device_12345';
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          device_code: deviceCode,
          user_code: 'ABCD-1234',
          verification_uri: 'https://auth.bmwgroup.com/device',
          expires_in: 900,
          interval: 5,
        })
      );
      await authProvider.requestDeviceCode();

      // Poll response missing `error` field (malformed BMW error body)
      mockFetch.mockResolvedValue(createFetchResponse({ message: 'something broke' }, 400));

      // Act & Assert - should be a proper AuthenticationError, not a TypeError
      await expect(authProvider.pollForTokens(deviceCode)).rejects.toThrow(AuthenticationError);
      await expect(authProvider.pollForTokens(deviceCode)).rejects.not.toThrow(TypeError);
    });

    // RFC 8628 §3.5: the client MUST continue polling on `slow_down`, only
    // increasing the interval by 5 seconds. Previously we threw RateLimitError
    // which aborted the entire 15-minute auth flow on a single slow_down.
    it('should_continuePolling_when_serverReturnsSlowDown', async () => {
      // Arrange - fresh provider with tiny intervals
      const fastProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, {
        ...options,
        pollInterval: 1,
      });
      const deviceCode = 'device_12345';

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          device_code: deviceCode,
          user_code: 'ABCD-1234',
          verification_uri: 'https://auth.bmwgroup.com/device',
          expires_in: 900,
          interval: 5,
        })
      );
      await fastProvider.requestDeviceCode();

      // First poll: slow_down; second poll: tokens
      mockFetch
        .mockResolvedValueOnce(
          createFetchResponse({ error: 'slow_down', error_description: 'too fast' }, 400)
        )
        .mockResolvedValueOnce(
          createFetchResponse({
            gcid: 'gcid',
            access_token: 'at',
            refresh_token: 'rt',
            id_token: 'idt',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'vehicle:read',
          })
        );

      // Act
      const result = await fastProvider.pollForTokens(deviceCode);

      // Assert - slow_down was handled gracefully, polling continued, tokens received
      expect(result.accessToken).toBe('at');
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 device code + 2 polls
    }, 10000);

    // Transient backend issues (5xx with no body, JSON parse failures, network blips)
    // should not abort the entire 15-minute auth flow. RFC 8628 expects clients to
    // keep polling. Previously a single network/parse error wrapped as NetworkError
    // killed the flow and the user saw "Failed to poll for tokens".
    it('should_continuePolling_when_transientNetworkErrorOccurs', async () => {
      // Arrange
      const fastProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, {
        ...options,
        pollInterval: 1,
      });
      const deviceCode = 'device_12345';

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          device_code: deviceCode,
          user_code: 'ABCD-1234',
          verification_uri: 'https://auth.bmwgroup.com/device',
          expires_in: 900,
          interval: 5,
        })
      );
      await fastProvider.requestDeviceCode();

      // First poll: network error (socket reset); second poll: tokens
      mockFetch.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(
        createFetchResponse({
          gcid: 'gcid',
          access_token: 'at_after_retry',
          refresh_token: 'rt',
          id_token: 'idt',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'vehicle:read',
        })
      );

      // Act
      const result = await fastProvider.pollForTokens(deviceCode);

      // Assert - transient error was tolerated, polling continued
      expect(result.accessToken).toBe('at_after_retry');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    // requestDeviceCode should tolerate a single transient network failure by
    // retrying once with backoff (issue #99 - "Failed to connect to OAuth server"
    // on first attempt, succeeds on retry).
    it('should_retryOnce_when_requestDeviceCodeHitsTransientNetworkError', async () => {
      // Arrange
      const fastProvider = new DeviceCodeAuthProvider(mockTokenStore, clientId, {
        ...options,
        pollInterval: 1,
      });

      mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND')).mockResolvedValueOnce(
        createFetchResponse({
          device_code: 'dc',
          user_code: 'UC-1',
          verification_uri: 'https://auth.bmwgroup.com/device',
          expires_in: 900,
          interval: 5,
        })
      );

      // Act
      const result = await fastProvider.requestDeviceCode();

      // Assert - retried successfully
      expect(result.deviceCode).toBe('dc');
      expect(mockFetch).toHaveBeenCalledTimes(2);
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
