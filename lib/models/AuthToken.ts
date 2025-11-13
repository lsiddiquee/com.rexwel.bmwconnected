/**
 * Generic AuthToken model
 *
 * Represents OAuth 2.0 authentication tokens.
 * Compatible with OAuth 2.0 Device Code Flow and other OAuth flows.
 */

/**
 * Complete OAuth token set
 */
export interface AuthToken {
  /**
   * Global unique identifier for the customer account
   */
  gcid: string;

  /**
   * Access token for API requests
   */
  accessToken: string;

  /**
   * Refresh token for obtaining new access tokens
   */
  refreshToken: string;

  /**
   * ID token (OIDC) - contains user information
   */
  idToken: string;

  /**
   * Token type (usually "Bearer")
   */
  tokenType: string;

  /**
   * Access token expiration time (Unix timestamp in seconds)
   */
  expiresAt: number;

  /**
   * Refresh token expiration time (Unix timestamp in seconds)
   */
  refreshTokenExpiresAt?: number;

  /**
   * Scopes granted for this token
   */
  scopes?: string[];

  /**
   * When this token was issued (Unix timestamp in seconds)
   */
  issuedAt?: number;
}

/**
 * Device code response from OAuth provider
 */
export interface DeviceCodeResponse {
  /**
   * Device code to use for token polling
   */
  deviceCode: string;

  /**
   * User code to display to the user
   */
  userCode: string;

  /**
   * Verification URL where user should authenticate
   */
  verificationUrl: string;

  /**
   * Complete verification URL with user code included
   */
  verificationUrlComplete?: string;

  /**
   * Device code expiration time in seconds
   */
  expiresIn: number;

  /**
   * Minimum interval between polling requests (in seconds)
   */
  interval: number;
}

/**
 * Token refresh request
 */
export interface TokenRefreshRequest {
  /**
   * Refresh token to use
   */
  refreshToken: string;

  /**
   * Client ID
   */
  clientId?: string;

  /**
   * Requested scopes (optional)
   */
  scopes?: string[];
}

/**
 * Token validation result
 */
export interface TokenValidation {
  /**
   * Whether the token is valid
   */
  isValid: boolean;

  /**
   * Whether the token is expired
   */
  isExpired: boolean;

  /**
   * Time until expiration in seconds (if valid)
   */
  expiresInSeconds?: number;

  /**
   * Validation error message (if invalid)
   */
  error?: string;
}
