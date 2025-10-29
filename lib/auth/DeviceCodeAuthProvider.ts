import { IAuthProvider } from './IAuthProvider';
import { DeviceCodeResponse, AuthToken } from '../models';
import { PkceGenerator, PkceChallenge } from './PkceGenerator';
import {
  DEFAULT_SCOPES,
  DEVICE_CODE_URL,
  TOKEN_URL,
  DEVICE_CODE_TIMEOUT_MS,
  TOKEN_POLL_INTERVAL_MS,
} from './constants';
import { ILogger } from '../types/ILogger';
import { ITokenStore } from '../types/ITokenStore';
import { AuthenticationError, RateLimitError, NetworkError, TimeoutError } from '../types/errors';

/**
 * Configuration options for DeviceCodeAuthProvider
 */
export interface DeviceCodeAuthOptions {
  /**
   * OAuth scopes to request
   * @default DEFAULT_SCOPES from constants
   */
  scopes?: string;

  /**
   * Device code URL endpoint
   * @default DEVICE_CODE_URL from constants
   */
  deviceCodeUrl?: string;

  /**
   * Token URL endpoint
   * @default TOKEN_URL from constants
   */
  tokenUrl?: string;

  /**
   * Maximum time to wait for device code authorization (milliseconds)
   * @default 900000 (15 minutes)
   */
  timeout?: number;

  /**
   * Interval between token polling attempts (milliseconds)
   * @default 5000 (5 seconds)
   */
  pollInterval?: number;

  /**
   * Logger instance for logging authentication events
   */
  logger?: ILogger;
}

/**
 * Implements OAuth 2.0 Device Code Flow for BMW CarData API
 *
 * The Device Code Flow is designed for devices with limited input capabilities
 * or no browser. It works as follows:
 *
 * 1. Request a device code and user code
 * 2. Display the user code and verification URL to the user
 * 3. Poll the token endpoint until the user completes authorization
 * 4. Store the resulting tokens
 *
 * This implementation includes PKCE (Proof Key for Code Exchange) for
 * enhanced security.
 *
 * @see https://tools.ietf.org/html/rfc8628
 * @see https://tools.ietf.org/html/rfc7636
 *
 * @example
 * ```typescript
 * const authProvider = new DeviceCodeAuthProvider(
 *   myTokenStore,
 *   'my-client-id-gcid',
 *   { logger: myLogger }
 * );
 *
 * // Start device code flow
 * const deviceCode = await authProvider.requestDeviceCode();
 * console.log(`Go to ${deviceCode.verificationUrl}`);
 * console.log(`Enter code: ${deviceCode.userCode}`);
 *
 * // Poll for tokens
 * const tokens = await authProvider.pollForTokens(deviceCode.deviceCode);
 * ```
 */
export class DeviceCodeAuthProvider implements IAuthProvider {
  private readonly clientId: string;
  private readonly scopes: string;
  private readonly deviceCodeUrl: string;
  private readonly tokenUrl: string;
  private readonly timeout: number;
  private readonly pollInterval: number;
  private readonly logger?: ILogger;
  private readonly tokenStore: ITokenStore;

  private currentTokens?: AuthToken;
  private pkceChallenge?: PkceChallenge;

  constructor(tokenStore: ITokenStore, clientId: string, options: DeviceCodeAuthOptions = {}) {
    this.clientId = clientId;
    this.scopes = options.scopes ?? DEFAULT_SCOPES;
    this.deviceCodeUrl = options.deviceCodeUrl ?? DEVICE_CODE_URL;
    this.tokenUrl = options.tokenUrl ?? TOKEN_URL;
    this.timeout = options.timeout ?? DEVICE_CODE_TIMEOUT_MS;
    this.pollInterval = options.pollInterval ?? TOKEN_POLL_INTERVAL_MS;
    this.logger = options.logger;
    this.tokenStore = tokenStore;

    this.logger?.debug('DeviceCodeAuthProvider initialized', {
      clientId: this.clientId,
      scopes: this.scopes,
      timeout: this.timeout,
      pollInterval: this.pollInterval,
    });
  }

  /**
   * Request a device code from the OAuth server
   *
   * Initiates the Device Code Flow by requesting a device code and user code.
   * The user must visit the verification URI and enter the user code to authorize.
   *
   * @param scopes - Optional OAuth scopes to request (overrides default)
   * @returns Device code response with user code and verification URI
   * @throws {AuthenticationError} If the device code request fails
   * @throws {NetworkError} If network request fails
   */
  async requestDeviceCode(scopes?: string[]): Promise<DeviceCodeResponse> {
    const requestScopes = scopes ? scopes.join(' ') : this.scopes;
    this.logger?.info('Requesting device code', { scopes: requestScopes });

    // Generate PKCE challenge
    this.pkceChallenge = PkceGenerator.generate();

    try {
      const response = await fetch(this.deviceCodeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          scope: requestScopes,
          code_challenge: this.pkceChallenge.codeChallenge,
          code_challenge_method: this.pkceChallenge.codeChallengeMethod,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger?.error('Device code request failed', undefined, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        throw new AuthenticationError(
          `Failed to request device code: ${response.statusText}`,
          'DEVICE_CODE_REQUEST_FAILED',
          { error: errorText, statusCode: response.status }
        );
      }

      const responseData: unknown = await response.json();
      // Validate device code response and transform to camelCase
      const data = this.validateDeviceCodeResponse(responseData);

      this.logger?.info('Device code received', {
        deviceCode: data.deviceCode.substring(0, 10) + '...',
        userCode: data.userCode,
        verificationUrl: data.verificationUrl,
        expiresIn: data.expiresIn,
      });

      return data;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      this.logger?.error('Network error requesting device code', error as Error);
      throw new NetworkError('Failed to connect to OAuth server', error as Error);
    }
  }

  /**
   * Poll for tokens after user authorization
   *
   * Continuously polls the token endpoint until:
   * - The user completes authorization (returns tokens)
   * - The device code expires (throws TimeoutError)
   * - An error occurs (throws appropriate error)
   *
   * @param deviceCode - Device code string from requestDeviceCode()
   * @returns Access and refresh tokens
   * @throws {AuthenticationError} If authorization fails
   * @throws {TimeoutError} If device code expires before authorization
   * @throws {RateLimitError} If polling too quickly
   * @throws {NetworkError} If network request fails
   */
  async pollForTokens(deviceCode: string): Promise<AuthToken> {
    if (!this.pkceChallenge) {
      throw new AuthenticationError(
        'No PKCE challenge available. Call requestDeviceCode() first.',
        'MISSING_PKCE_CHALLENGE'
      );
    }

    this.logger?.info('Starting token polling', {
      deviceCode: deviceCode.substring(0, 10) + '...',
    });

    const startTime = Date.now();
    const expirationTime = startTime + this.timeout;

    while (Date.now() < expirationTime) {
      try {
        const response = await fetch(this.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: this.clientId,
            code_verifier: this.pkceChallenge.codeVerifier,
          }),
        });

        const responseData: unknown = await response.json();

        if (response.ok) {
          // Success! We have tokens
          const tokens = this.validateTokenResponse(responseData);

          this.currentTokens = tokens;

          // Store tokens
          await this.tokenStore.storeToken(tokens, this.clientId);
          this.logger?.info('Tokens stored successfully', {
            clientId: this.clientId,
          });

          this.logger?.info('Token polling successful', {
            expiresAt: tokens.expiresAt,
            scopes: tokens.scopes,
          });

          return tokens;
        }

        // Handle expected errors during polling
        const data = responseData as Record<string, unknown>;
        const errorCode = data.error as string;

        if (errorCode === 'authorization_pending') {
          // User hasn't authorized yet, continue polling
          this.logger?.debug('Authorization pending, continuing to poll');
        } else if (errorCode === 'slow_down') {
          // Server wants us to slow down
          this.logger?.warn('Slow down requested by server');
          throw new RateLimitError(
            'Polling too quickly. Please slow down.',
            this.pollInterval + 1000
          );
        } else if (errorCode === 'expired_token') {
          // Device code expired
          throw new TimeoutError(
            'Device code expired before authorization completed',
            this.timeout
          );
        } else if (errorCode === 'access_denied') {
          // User denied authorization
          throw new AuthenticationError('User denied authorization', 'ACCESS_DENIED');
        } else {
          // Unknown error
          const errorDesc = (data.error_description as string) ?? errorCode;
          throw new AuthenticationError(
            `Token polling failed: ${errorDesc}`,
            errorCode.toUpperCase()
          );
        }

        // Wait before next poll
        await this.sleep(this.pollInterval);
      } catch (error) {
        if (
          error instanceof AuthenticationError ||
          error instanceof RateLimitError ||
          error instanceof TimeoutError
        ) {
          throw error;
        }

        this.logger?.error('Network error during token polling', error as Error);
        throw new NetworkError('Failed to poll for tokens', error as Error);
      }
    }

    // Timeout reached
    throw new TimeoutError('Device code authorization timed out', this.timeout);
  }

  /**
   * Refresh expired access token using refresh token
   *
   * @param refreshToken - Refresh token from previous authentication
   * @returns New access token and possibly a new refresh token
   * @throws {AuthenticationError} If refresh fails
   * @throws {NetworkError} If network request fails
   */
  async refreshTokens(refreshToken: string): Promise<AuthToken> {
    this.logger?.info('Refreshing tokens');

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger?.error('Token refresh failed', undefined, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        throw new AuthenticationError(
          `Failed to refresh tokens: ${response.statusText}`,
          'TOKEN_REFRESH_FAILED',
          { error: errorText, statusCode: response.status }
        );
      }

      const responseData: unknown = await response.json();
      const tokens = this.validateTokenResponse(responseData);

      // Keep old refresh token if new one not provided
      tokens.refreshToken ??= refreshToken;

      this.currentTokens = tokens;

      // Store refreshed tokens
      await this.tokenStore.storeToken(tokens, this.clientId);
      this.logger?.info('Refreshed tokens stored successfully', {
        clientId: this.clientId,
      });

      this.logger?.info('Tokens refreshed successfully', {
        expiresAt: tokens.expiresAt,
      });

      return tokens;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      this.logger?.error('Network error refreshing tokens', error as Error);
      throw new NetworkError('Failed to refresh tokens', error as Error);
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   *
   * Checks if the current access token is expired and automatically
   * refreshes it if needed.
   *
   * @returns Valid access token
   * @throws {AuthenticationError} If no tokens are available or refresh fails
   */
  async getValidAccessToken(): Promise<string> {
    // Try to load tokens from store if not in memory
    this.currentTokens ??= await this.tokenStore.retrieveToken(this.clientId);

    if (!this.currentTokens) {
      throw new AuthenticationError('No tokens available. Please authenticate first.', 'NO_TOKENS');
    }

    // Check if access token is expired (with 60 second buffer)
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.currentTokens.expiresAt;

    if (now + 60 >= expiresAt) {
      this.logger?.info('Access token expired, refreshing');
      this.currentTokens = await this.refreshTokens(this.currentTokens.refreshToken);
    }

    return this.currentTokens.accessToken;
  }

  /**
   * Get the full AuthToken object, refreshing if necessary
   *
   * Returns the complete token object including gcid and idToken needed for MQTT.
   *
   * @returns Complete AuthToken object
   * @throws {AuthenticationError} If no tokens are available or refresh fails
   */
  async getToken(): Promise<AuthToken> {
    // Try to load tokens from store if not in memory
    this.currentTokens ??= await this.tokenStore.retrieveToken(this.clientId);

    if (!this.currentTokens) {
      throw new AuthenticationError('No tokens available. Please authenticate first.', 'NO_TOKENS');
    }

    // Check if access token is expired (with 60 second buffer)
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.currentTokens.expiresAt;

    if (now + 60 >= expiresAt) {
      this.logger?.info('Access token expired, refreshing');
      this.currentTokens = await this.refreshTokens(this.currentTokens.refreshToken);
    }

    return this.currentTokens;
  }

  /**
   * Check if access token is expired
   *
   * @returns True if access token is expired or will expire within 60 seconds
   */
  isAccessTokenExpired(): boolean {
    if (!this.currentTokens) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return now + 60 >= this.currentTokens.expiresAt;
  }

  /**
   * Check if refresh token is expired
   *
   * Note: BMW doesn't provide expiration time for refresh tokens,
   * so this always returns false. Refresh token expiration will be
   * detected when attempting to use it.
   *
   * @returns Always false (refresh token expiration unknown)
   */
  isRefreshTokenExpired(): boolean {
    // BMW CarData API doesn't provide refresh token expiration
    // We'll discover it's expired when we try to use it
    return false;
  }

  /**
   * Revoke tokens (cleanup)
   *
   * Clears tokens from memory and storage. Note: BMW CarData API
   * doesn't provide a token revocation endpoint, so tokens remain
   * valid until they expire naturally.
   */
  async revokeTokens(): Promise<void> {
    this.logger?.info('Revoking tokens');

    this.currentTokens = undefined;
    this.pkceChallenge = undefined;

    await this.tokenStore.deleteToken(this.clientId);
    this.logger?.info('Tokens deleted from store', {
      clientId: this.clientId,
    });
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms - Milliseconds to sleep
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate and parse device code response
   *
   * Maps API response (snake_case) to model (camelCase)
   *
   * @param data - Response data from device code endpoint
   * @returns Validated DeviceCodeResponse
   * @throws {AuthenticationError} If response is invalid
   * @private
   */
  private validateDeviceCodeResponse(data: unknown): DeviceCodeResponse {
    const response = data as Record<string, unknown>;

    if (
      typeof response.device_code !== 'string' ||
      typeof response.user_code !== 'string' ||
      typeof response.verification_uri !== 'string' ||
      typeof response.expires_in !== 'number'
    ) {
      throw new AuthenticationError('Invalid device code response format', 'INVALID_RESPONSE', {
        received: data,
      });
    }

    // Map snake_case API response to camelCase model
    const validated: DeviceCodeResponse = {
      deviceCode: response.device_code,
      userCode: response.user_code,
      verificationUrl: response.verification_uri,
      verificationUrlComplete: response.verification_uri_complete as string | undefined,
      expiresIn: response.expires_in,
      interval: (response.interval as number | undefined) ?? 5,
    };

    return validated;
  }

  /**
   * Validate and parse token response
   *
   * Maps API response (snake_case) to model (camelCase)
   *
   * @param data - Response data from token endpoint
   * @returns Validated AuthToken
   * @throws {AuthenticationError} If response is invalid
   * @private
   */
  private validateTokenResponse(data: unknown): AuthToken {
    const response = data as Record<string, unknown>;

    if (
      typeof response.gcid !== 'string' ||
      typeof response.access_token !== 'string' ||
      typeof response.refresh_token !== 'string' ||
      typeof response.expires_in !== 'number' ||
      typeof response.id_token !== 'string'
    ) {
      throw new AuthenticationError('Invalid token response format', 'INVALID_TOKEN_RESPONSE', {
        received: data,
      });
    }

    // Map snake_case API response to camelCase model
    const validated: AuthToken = {
      gcid: response.gcid,
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      idToken: response.id_token,
      tokenType: (response.token_type as string | undefined) ?? 'Bearer',
      expiresAt: Math.floor(Date.now() / 1000) + response.expires_in,
      scopes: response.scope ? [response.scope as string] : undefined,
      issuedAt: Math.floor(Date.now() / 1000),
    };

    return validated;
  }
}
