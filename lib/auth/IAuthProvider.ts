/**
 * Authentication Provider Interface
 *
 * Defines the contract for authentication providers.
 * Supports OAuth 2.0 Device Code Flow and other authentication methods.
 */

import { AuthToken, DeviceCodeResponse } from '../models';

/**
 * Main interface for authentication providers
 */
export interface IAuthProvider {
  /**
   * Request a device code for OAuth 2.0 Device Code Flow
   *
   * @param scopes - Optional array of OAuth scopes to request
   * @returns Promise resolving to device code response
   * @throws {AuthenticationError} If device code request fails
   */
  requestDeviceCode(scopes?: string[]): Promise<DeviceCodeResponse>;

  /**
   * Poll for tokens after user has authorized the device code
   *
   * @param deviceCode - Device code from requestDeviceCode
   * @returns Promise resolving to auth token set
   * @throws {AuthenticationError} If authorization fails or times out
   */
  pollForTokens(deviceCode: string): Promise<AuthToken>;

  /**
   * Refresh an expired access token using a refresh token
   *
   * @param refreshToken - Refresh token to use
   * @returns Promise resolving to new auth token set
   * @throws {AuthenticationError} If token refresh fails
   */
  refreshTokens(refreshToken: string): Promise<AuthToken>;

  /**
   * Get a valid access token, refreshing if necessary
   *
   * @returns Promise resolving to valid access token string
   * @throws {AuthenticationError} If no valid token is available
   */
  getValidAccessToken(): Promise<string>;

  /**
   * Get the full AuthToken object, refreshing if necessary
   *
   * @returns Promise resolving to complete auth token object
   * @throws {AuthenticationError} If no valid token is available
   */
  getToken(): Promise<AuthToken>;

  /**
   * Check if access token is expired
   *
   * @returns true if expired, false otherwise
   */
  isAccessTokenExpired(): boolean;

  /**
   * Check if refresh token is expired
   *
   * @returns true if expired, false otherwise
   */
  isRefreshTokenExpired(): boolean;

  /**
   * Revoke/invalidate current tokens
   *
   * @returns Promise that resolves when tokens are revoked
   */
  revokeTokens(): Promise<void>;
}
