import Homey from 'homey/lib/Homey';
import { ITokenStore } from '../lib/types/ITokenStore';
import { AuthToken } from '../lib/models/AuthToken';

/**
 * Homey-based token storage implementation
 *
 * Stores tokens at app-level (not per-device) in Homey settings.
 * Tokens are keyed by client ID (which maps to BMW GCID).
 * Multiple vehicles can share the same token if they use the same client ID.
 *
 * Storage key format: `token_${clientId}`
 *
 * @example
 * ```typescript
 * const tokenStore = new HomeyTokenStore(this.homey);
 * await tokenStore.storeToken(token, 'my-client-id-uuid');
 * const token = await tokenStore.retrieveToken('my-client-id-uuid');
 * ```
 */
export class HomeyTokenStore implements ITokenStore {
  private homey: Homey;

  constructor(homey: Homey) {
    this.homey = homey;
  }

  /**
   * Generate storage key for client ID-based token storage
   *
   * @param clientId - BMW CarData API client ID (UUID)
   * @returns Storage key for Homey settings
   */
  private getTokenKey(clientId: string): string {
    return `token_${clientId}`;
  }

  /**
   * Store authentication token
   *
   * @param token - Token to store
   * @param clientId - BMW CarData API client ID (GCID)
   */
  storeToken(token: AuthToken, clientId: string): Promise<void> {
    const key = this.getTokenKey(clientId);
    this.homey.settings.set(key, token);
    this.homey.app.log(`[HomeyTokenStore] Stored token for client ID: ${clientId}`);
    return Promise.resolve();
  }

  /**
   * Retrieve stored authentication token
   *
   * @param clientId - BMW CarData API client ID (GCID)
   * @returns Stored token or undefined if not found
   */
  retrieveToken(clientId: string): Promise<AuthToken | undefined> {
    const key = this.getTokenKey(clientId);
    const token = this.homey.settings.get(key) as AuthToken | undefined;

    if (!token) {
      this.homey.app.log(`[HomeyTokenStore] No token found for client ID: ${clientId}`);
      return Promise.resolve(undefined);
    }

    this.homey.app.log(`[HomeyTokenStore] Retrieved token for client ID: ${clientId}`);
    return Promise.resolve(token);
  }

  /**
   * Delete stored authentication token
   *
   * @param clientId - BMW CarData API client ID (GCID)
   */
  deleteToken(clientId: string): Promise<void> {
    const key = this.getTokenKey(clientId);
    this.homey.settings.unset(key);
    this.homey.app.log(`[HomeyTokenStore] Deleted token for client ID: ${clientId}`);
    return Promise.resolve();
  }

  /**
   * Check if a token exists in storage
   *
   * @param clientId - BMW CarData API client ID (GCID)
   * @returns true if token exists, false otherwise
   */
  async hasToken(clientId: string): Promise<boolean> {
    const token = await this.retrieveToken(clientId);
    return token !== undefined;
  }

  /**
   * Get all stored client IDs (for migration and debugging)
   *
   * @returns Array of client IDs that have tokens stored
   */
  getStoredClientIds(): string[] {
    const keys: string[] = this.homey.settings.getKeys();
    return keys.filter((key) => key.startsWith('token_')).map((key) => key.replace('token_', ''));
  }
}
