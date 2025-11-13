/**
 * Token Store Interface
 *
 * Defines the contract for secure token storage.
 * Implementations should store tokens securely (encrypted if possible).
 */

import { AuthToken } from '../models';

/**
 * Interface for storing and retrieving authentication tokens
 */
export interface ITokenStore {
  /**
   * Store authentication tokens
   *
   * @param token - Token set to store
   * @param clientId - BMW CarData API client ID (GCID)
   * @returns Promise that resolves when token is stored
   */
  storeToken(token: AuthToken, clientId: string): Promise<void>;

  /**
   * Retrieve stored authentication tokens
   *
   * @param clientId - BMW CarData API client ID (GCID)
   * @returns Promise resolving to stored token, or undefined if not found
   */
  retrieveToken(clientId: string): Promise<AuthToken | undefined>;

  /**
   * Delete stored authentication tokens
   *
   * @param clientId - BMW CarData API client ID (GCID)
   * @returns Promise that resolves when token is deleted
   */
  deleteToken(clientId: string): Promise<void>;

  /**
   * Check if a token exists in storage
   *
   * @param clientId - BMW CarData API client ID (GCID)
   * @returns Promise resolving to true if token exists, false otherwise
   */
  hasToken(clientId: string): Promise<boolean>;
}
