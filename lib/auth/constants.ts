/**
 * BMW CarData OAuth 2.0 Authentication Constants
 *
 * These constants define the endpoints and configuration for BMW's
 * OAuth 2.0 Device Code Flow authentication.
 */

/**
 * BMW OAuth device code endpoint
 *
 * Used to request a device code and user code for the Device Code Flow.
 *
 * @see https://customer.bmwgroup.com/gcdm/oauth/device/code
 */
export const DEVICE_CODE_URL = 'https://customer.bmwgroup.com/gcdm/oauth/device/code';

/**
 * BMW OAuth token endpoint
 *
 * Used for:
 * - Polling for access tokens (device code grant)
 * - Refreshing access tokens (refresh token grant)
 * - Revoking tokens
 *
 * @see https://customer.bmwgroup.com/gcdm/oauth/token
 */
export const TOKEN_URL = 'https://customer.bmwgroup.com/gcdm/oauth/token';

/**
 * Default OAuth scopes for BMW CarData API
 *
 * - authenticate_user: Basic user authentication
 * - openid: OpenID Connect for ID token
 * - cardata:api:read: Read access to vehicle data
 * - cardata:streaming:read: Read access to streaming vehicle data
 */
export const DEFAULT_SCOPES = 'authenticate_user openid cardata:api:read cardata:streaming:read';

/**
 * Default timeout for device code authorization (15 minutes)
 *
 * Maximum time to wait for user to complete authorization in browser.
 */
export const DEVICE_CODE_TIMEOUT_MS = 900000; // 15 minutes in milliseconds

/**
 * Default polling interval for device code flow (5 seconds)
 *
 * How often to check if user has completed authorization.
 * Server may request slower polling via 'slow_down' error.
 */
export const TOKEN_POLL_INTERVAL_MS = 5000; // 5 seconds in milliseconds

/**
 * Token expiration buffer (60 seconds)
 *
 * Refresh tokens this many seconds before they actually expire
 * to prevent using expired tokens.
 */
export const TOKEN_EXPIRATION_BUFFER_SECONDS = 60; // 60 seconds
