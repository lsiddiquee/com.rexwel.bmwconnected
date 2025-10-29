/**
 * Unit Tests for DeviceCodeAuthProvider
 *
 * Tests OAuth 2.0 Device Code Flow implementation
 */

import { strict as assert } from 'assert';
import { DeviceCodeAuthProvider } from '../../../lib/auth/DeviceCodeAuthProvider';
import { ITokenStore } from '../../../lib/types/ITokenStore';
import { ILogger, LogLevel } from '../../../lib/types/ILogger';
import { AuthToken } from '../../../lib/models';
import {
  AuthenticationError,
  TimeoutError,
  RateLimitError,
  NetworkError,
} from '../../../lib/types/errors';

// Mock implementations
class MockTokenStore implements ITokenStore {
  private tokens: Map<string, AuthToken> = new Map();

  async storeToken(token: AuthToken, clientId: string): Promise<void> {
    this.tokens.set(clientId, token);
  }

  async retrieveToken(clientId: string): Promise<AuthToken | undefined> {
    return this.tokens.get(clientId);
  }

  async deleteToken(clientId: string): Promise<void> {
    this.tokens.delete(clientId);
  }

  async hasToken(clientId: string): Promise<boolean> {
    return this.tokens.has(clientId);
  }

  clear(): void {
    this.tokens.clear();
  }
}

class MockLogger implements ILogger {
  logs: Array<{
    level: string;
    message: string;
    error?: Error;
    context?: Record<string, unknown>;
  }> = [];
  private currentLevel: LogLevel = LogLevel.TRACE;

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: LogLevel[level], message, context });
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'trace', message, context });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, error, context });
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.logs.push({ level: 'fatal', message, error, context });
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  clear(): void {
    this.logs = [];
  }
}

// Mock fetch for testing
type FetchMock = (url: string, init?: RequestInit) => Promise<Response>;

let originalFetch: typeof global.fetch;
let mockFetch: FetchMock | undefined;

function setupFetchMock(mock: FetchMock): void {
  mockFetch = mock;
  originalFetch = global.fetch;
  global.fetch = mock as typeof global.fetch;
}

function teardownFetchMock(): void {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
  mockFetch = undefined;
}

// Test helpers
function createSuccessResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

function createErrorResponse(status: number, data: unknown): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

// Tests
describe('DeviceCodeAuthProvider', () => {
  let tokenStore: MockTokenStore;
  let logger: MockLogger;

  beforeEach(() => {
    tokenStore = new MockTokenStore();
    logger = new MockLogger();
  });

  afterEach(() => {
    teardownFetchMock();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const provider = new DeviceCodeAuthProvider();
      assert.ok(provider);
    });

    it('should initialize with custom options', () => {
      const provider = new DeviceCodeAuthProvider({
        clientId: 'custom-client-id',
        scopes: 'custom-scope',
        timeout: 10000,
        pollInterval: 2000,
        logger,
        tokenStore,
        identifier: 'test-device',
      });

      assert.ok(provider);
      assert.strictEqual(logger.logs.length, 1);
      assert.strictEqual(logger.logs[0].level, 'debug');
      assert.strictEqual(logger.logs[0].message, 'DeviceCodeAuthProvider initialized');
    });
  });

  describe('requestDeviceCode', () => {
    it('should successfully request a device code', async () => {
      const mockResponse = {
        device_code: 'mock-device-code-12345',
        user_code: 'ABCD-1234',
        verification_uri: 'https://example.com/activate',
        expires_in: 900,
        interval: 5,
      };

      setupFetchMock(async (url) => {
        assert.strictEqual(url, 'https://idp.bmwgroup.com/gcdm/oauth/device/authorize');
        return createSuccessResponse(mockResponse);
      });

      const provider = new DeviceCodeAuthProvider({ logger });
      const result = await provider.requestDeviceCode();

      assert.strictEqual(result.deviceCode, 'mock-device-code-12345');
      assert.strictEqual(result.userCode, 'ABCD-1234');
      assert.strictEqual(result.verificationUrl, 'https://example.com/activate');
      assert.strictEqual(result.expiresIn, 900);
      assert.strictEqual(result.interval, 5);
    });

    it('should handle custom scopes', async () => {
      setupFetchMock(async (url, init) => {
        const body = new URLSearchParams(init?.body as string);
        assert.strictEqual(body.get('scope'), 'custom-scope-1 custom-scope-2');

        return createSuccessResponse({
          device_code: 'test',
          user_code: 'TEST',
          verification_uri: 'https://test.com',
          expires_in: 900,
        });
      });

      const provider = new DeviceCodeAuthProvider();
      await provider.requestDeviceCode(['custom-scope-1', 'custom-scope-2']);
    });

    it('should throw AuthenticationError on API error', async () => {
      setupFetchMock(async () => createErrorResponse(400, { error: 'invalid_request' }));

      const provider = new DeviceCodeAuthProvider({ logger });

      await assert.rejects(
        async () => provider.requestDeviceCode(),
        (error: Error) => {
          assert.ok(error instanceof AuthenticationError);
          assert.match(error.message, /Failed to request device code/);
          return true;
        }
      );
    });

    it('should throw NetworkError on network failure', async () => {
      setupFetchMock(async () => {
        throw new Error('Network failure');
      });

      const provider = new DeviceCodeAuthProvider({ logger });

      await assert.rejects(
        async () => provider.requestDeviceCode(),
        (error: Error) => {
          assert.ok(error instanceof NetworkError);
          assert.match(error.message, /Failed to connect to OAuth server/);
          return true;
        }
      );
    });

    it('should throw AuthenticationError on invalid response format', async () => {
      setupFetchMock(async () =>
        createSuccessResponse({
          invalid_field: 'value',
        })
      );

      const provider = new DeviceCodeAuthProvider();

      await assert.rejects(
        async () => provider.requestDeviceCode(),
        (error: Error) => {
          assert.ok(error instanceof AuthenticationError);
          assert.match(error.message, /Invalid device code response format/);
          return true;
        }
      );
    });
  });

  describe('pollForTokens', () => {
    beforeEach(() => {
      // Mock successful device code request
      setupFetchMock(async (url) => {
        if (url.includes('device/authorize')) {
          return createSuccessResponse({
            device_code: 'test-device-code',
            user_code: 'TEST',
            verification_uri: 'https://test.com',
            expires_in: 900,
          });
        }
        return createErrorResponse(404, {});
      });
    });

    it('should successfully poll and receive tokens', async () => {
      const provider = new DeviceCodeAuthProvider({ tokenStore, logger });
      const deviceCodeResponse = await provider.requestDeviceCode();

      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'vehicle:read',
          });
        }
        return createErrorResponse(404, {});
      });

      const tokens = await provider.pollForTokens(deviceCodeResponse.deviceCode);

      assert.strictEqual(tokens.accessToken, 'mock-access-token');
      assert.strictEqual(tokens.refreshToken, 'mock-refresh-token');
      assert.strictEqual(tokens.tokenType, 'Bearer');
      assert.ok(tokens.expiresAt > Math.floor(Date.now() / 1000));

      // Verify token was stored
      const storedToken = await tokenStore.retrieveToken();
      assert.ok(storedToken);
      assert.strictEqual(storedToken.accessToken, 'mock-access-token');
    });

    it('should handle authorization_pending and continue polling', async () => {
      const provider = new DeviceCodeAuthProvider({
        pollInterval: 100,
        logger,
      });
      const deviceCodeResponse = await provider.requestDeviceCode();

      let pollCount = 0;
      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          pollCount++;
          if (pollCount < 3) {
            return createSuccessResponse({ error: 'authorization_pending' });
          }
          return createSuccessResponse({
            access_token: 'token',
            refresh_token: 'refresh',
            expires_in: 3600,
          });
        }
        return createErrorResponse(404, {});
      });

      const tokens = await provider.pollForTokens(deviceCodeResponse.deviceCode);
      assert.strictEqual(pollCount, 3);
      assert.strictEqual(tokens.accessToken, 'token');
    });

    it('should throw RateLimitError on slow_down', async () => {
      const provider = new DeviceCodeAuthProvider({ logger });
      const deviceCodeResponse = await provider.requestDeviceCode();

      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({ error: 'slow_down' });
        }
        return createErrorResponse(404, {});
      });

      await assert.rejects(
        async () => provider.pollForTokens(deviceCodeResponse.deviceCode),
        (error: Error) => {
          assert.ok(error instanceof RateLimitError);
          assert.match(error.message, /Polling too quickly/);
          return true;
        }
      );
    });

    it('should throw TimeoutError on expired_token', async () => {
      const provider = new DeviceCodeAuthProvider({ logger });
      const deviceCodeResponse = await provider.requestDeviceCode();

      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({ error: 'expired_token' });
        }
        return createErrorResponse(404, {});
      });

      await assert.rejects(
        async () => provider.pollForTokens(deviceCodeResponse.deviceCode),
        (error: Error) => {
          assert.ok(error instanceof TimeoutError);
          assert.match(error.message, /Device code expired/);
          return true;
        }
      );
    });

    it('should throw AuthenticationError on access_denied', async () => {
      const provider = new DeviceCodeAuthProvider({ logger });
      const deviceCodeResponse = await provider.requestDeviceCode();

      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({ error: 'access_denied' });
        }
        return createErrorResponse(404, {});
      });

      await assert.rejects(
        async () => provider.pollForTokens(deviceCodeResponse.deviceCode),
        (error: Error) => {
          assert.ok(error instanceof AuthenticationError);
          assert.match(error.message, /User denied authorization/);
          return true;
        }
      );
    });

    it('should throw TimeoutError when timeout is reached', async () => {
      const provider = new DeviceCodeAuthProvider({
        timeout: 500,
        pollInterval: 100,
        logger,
      });
      const deviceCodeResponse = await provider.requestDeviceCode();

      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({ error: 'authorization_pending' });
        }
        return createErrorResponse(404, {});
      });

      await assert.rejects(
        async () => provider.pollForTokens(deviceCodeResponse.deviceCode),
        (error: Error) => {
          assert.ok(error instanceof TimeoutError);
          assert.match(error.message, /authorization timed out/);
          return true;
        }
      );
    });

    it('should throw AuthenticationError if PKCE challenge is missing', async () => {
      const provider = new DeviceCodeAuthProvider();

      await assert.rejects(
        async () => provider.pollForTokens('test-device-code'),
        (error: Error) => {
          assert.ok(error instanceof AuthenticationError);
          assert.match(error.message, /No PKCE challenge available/);
          return true;
        }
      );
    });
  });

  describe('refreshTokens', () => {
    it('should successfully refresh tokens', async () => {
      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          });
        }
        return createErrorResponse(404, {});
      });

      const provider = new DeviceCodeAuthProvider({ tokenStore, logger });
      const tokens = await provider.refreshTokens('old-refresh-token');

      assert.strictEqual(tokens.accessToken, 'new-access-token');
      assert.strictEqual(tokens.refreshToken, 'new-refresh-token');

      // Verify token was stored
      const storedToken = await tokenStore.retrieveToken();
      assert.ok(storedToken);
      assert.strictEqual(storedToken.accessToken, 'new-access-token');
    });

    it('should keep old refresh token if new one not provided', async () => {
      setupFetchMock(async (url) => {
        if (url.includes('token')) {
          return createSuccessResponse({
            access_token: 'new-access-token',
            expires_in: 3600,
            // No refresh_token in response
          });
        }
        return createErrorResponse(404, {});
      });

      const provider = new DeviceCodeAuthProvider({ logger });
      const tokens = await provider.refreshTokens('old-refresh-token');

      assert.strictEqual(tokens.accessToken, 'new-access-token');
      assert.strictEqual(tokens.refreshToken, 'old-refresh-token');
    });

    it('should throw AuthenticationError on API error', async () => {
      setupFetchMock(async () =>
        createErrorResponse(401, { error: 'invalid_grant', error_description: 'Token expired' })
      );

      const provider = new DeviceCodeAuthProvider({ logger });

      await assert.rejects(
        async () => provider.refreshTokens('invalid-token'),
        (error: Error) => {
          assert.ok(error instanceof AuthenticationError);
          assert.match(error.message, /Failed to refresh tokens/);
          return true;
        }
      );
    });

    it('should throw NetworkError on network failure', async () => {
      setupFetchMock(async () => {
        throw new Error('Network failure');
      });

      const provider = new DeviceCodeAuthProvider({ logger });

      await assert.rejects(
        async () => provider.refreshTokens('token'),
        (error: Error) => {
          assert.ok(error instanceof NetworkError);
          return true;
        }
      );
    });
  });

  describe('getValidAccessToken', () => {
    it('should return valid access token', async () => {
      const futureExpiration = Math.floor(Date.now() / 1000) + 3600;
      const token: AuthToken = {
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: futureExpiration,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000),
      };

      await tokenStore.storeToken(token);

      const provider = new DeviceCodeAuthProvider({ tokenStore });
      const accessToken = await provider.getValidAccessToken();

      assert.strictEqual(accessToken, 'valid-token');
    });

    it('should refresh expired token automatically', async () => {
      const pastExpiration = Math.floor(Date.now() / 1000) - 100;
      const token: AuthToken = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: pastExpiration,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000) - 3700,
      };

      await tokenStore.storeToken(token);

      setupFetchMock(async () =>
        createSuccessResponse({
          access_token: 'refreshed-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        })
      );

      const provider = new DeviceCodeAuthProvider({ tokenStore, logger });
      const accessToken = await provider.getValidAccessToken();

      assert.strictEqual(accessToken, 'refreshed-token');
    });

    it('should throw AuthenticationError if no tokens available', async () => {
      const provider = new DeviceCodeAuthProvider();

      await assert.rejects(
        async () => provider.getValidAccessToken(),
        (error: Error) => {
          assert.ok(error instanceof AuthenticationError);
          assert.match(error.message, /No tokens available/);
          return true;
        }
      );
    });
  });

  describe('isAccessTokenExpired', () => {
    it('should return true if no tokens', () => {
      const provider = new DeviceCodeAuthProvider();
      assert.strictEqual(provider.isAccessTokenExpired(), true);
    });

    it('should return false for valid token', async () => {
      const futureExpiration = Math.floor(Date.now() / 1000) + 3600;
      const token: AuthToken = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: futureExpiration,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000),
      };

      await tokenStore.storeToken(token);

      const provider = new DeviceCodeAuthProvider({ tokenStore });
      await provider.getValidAccessToken(); // Load token into memory

      assert.strictEqual(provider.isAccessTokenExpired(), false);
    });

    it('should return true for expired token', async () => {
      const pastExpiration = Math.floor(Date.now() / 1000) - 100;
      const token: AuthToken = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: pastExpiration,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000) - 3700,
      };

      await tokenStore.storeToken(token);

      const provider = new DeviceCodeAuthProvider({ tokenStore });
      await provider.getValidAccessToken().catch(() => {
        /* ignore */
      }); // Try to load token

      assert.strictEqual(provider.isAccessTokenExpired(), true);
    });
  });

  describe('isRefreshTokenExpired', () => {
    it('should always return false (BMW API does not provide expiration)', () => {
      const provider = new DeviceCodeAuthProvider();
      assert.strictEqual(provider.isRefreshTokenExpired(), false);
    });
  });

  describe('revokeTokens', () => {
    it('should clear tokens from memory and storage', async () => {
      const token: AuthToken = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        tokenType: 'Bearer',
        issuedAt: Math.floor(Date.now() / 1000),
      };

      await tokenStore.storeToken(token, 'test-id');

      const provider = new DeviceCodeAuthProvider({
        tokenStore,
        identifier: 'test-id',
        logger,
      });

      await provider.revokeTokens();

      // Verify token removed from storage
      const storedToken = await tokenStore.retrieveToken('test-id');
      assert.strictEqual(storedToken, undefined);

      // Verify can't get access token
      await assert.rejects(async () => provider.getValidAccessToken(), AuthenticationError);
    });
  });
});

// Simple test runner
async function runTests(): Promise<void> {
  console.log('Running DeviceCodeAuthProvider tests...\n');

  const testSuites: Array<() => Promise<void>> = [];

  let passedTests = 0;
  let failedTests = 0;

  for (const suite of testSuites) {
    try {
      await suite();
      passedTests++;
    } catch (error) {
      failedTests++;
      console.error(`Test failed: ${error}`);
    }
  }

  console.log(`\nTests completed: ${passedTests} passed, ${failedTests} failed`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run tests if this is the main module
if (require.main === module) {
  runTests().catch((error) => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

// Helper functions for test framework compatibility
function describe(name: string, fn: () => void): void {
  console.log(`\nTest Suite: ${name}`);
  fn();
}

function it(name: string, fn: () => void | Promise<void>): void {
  process.stdout.write(`  - ${name} ... `);
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => console.log('✓'))
        .catch((error) => {
          console.log('✗');
          console.error(`    Error: ${error.message}`);
        });
    } else {
      console.log('✓');
    }
  } catch (error) {
    console.log('✗');
    console.error(`    Error: ${(error as Error).message}`);
  }
}

function beforeEach(fn: () => void): void {
  fn();
}

function afterEach(fn: () => void): void {
  fn();
}
