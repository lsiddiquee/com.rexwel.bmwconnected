import { createHash, randomBytes } from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) parameters for OAuth 2.0
 */
export interface PkceChallenge {
  /**
   * Code verifier - random string sent when exchanging code for tokens
   */
  codeVerifier: string;

  /**
   * Code challenge - SHA256 hash of code verifier, sent in initial authorization request
   */
  codeChallenge: string;

  /**
   * Code challenge method - always 'S256' for SHA256
   */
  codeChallengeMethod: 'S256';
}

/**
 * Generates PKCE challenge pair for OAuth 2.0 Device Code Flow
 *
 * PKCE (Proof Key for Code Exchange) adds security to OAuth flows by proving
 * that the client requesting tokens is the same client that initiated the authorization.
 *
 * @see https://tools.ietf.org/html/rfc7636
 */
export class PkceGenerator {
  /**
   * Generate a PKCE code verifier and challenge pair
   *
   * Creates a cryptographically random code_verifier and derives the code_challenge
   * using SHA256 hash encoded in URL-safe base64.
   *
   * @returns PKCE challenge object with verifier, challenge, and method
   *
   * @example
   * ```typescript
   * const pkce = PkceGenerator.generate();
   * console.log(pkce.codeVerifier);     // Random string
   * console.log(pkce.codeChallenge);    // SHA256 hash of verifier
   * console.log(pkce.codeChallengeMethod); // 'S256'
   * ```
   */
  static generate(): PkceChallenge {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Generate a cryptographically random code verifier
   *
   * Generates a 64-character URL-safe random string used as the code_verifier.
   * This is sent when exchanging the device code for tokens.
   *
   * @returns URL-safe random string (64 characters)
   * @private
   */
  private static generateCodeVerifier(): string {
    // Generate 32 random bytes (256 bits)
    const randomBytesBuffer = randomBytes(32);

    // Convert to URL-safe base64 (no padding)
    return this.base64UrlEncode(randomBytesBuffer);
  }

  /**
   * Generate code challenge from code verifier
   *
   * Creates SHA256 hash of the code_verifier and encodes it as URL-safe base64.
   * This is sent in the initial device code request.
   *
   * @param codeVerifier - The code verifier to hash
   * @returns URL-safe base64 encoded SHA256 hash
   * @private
   */
  private static generateCodeChallenge(codeVerifier: string): string {
    // Create SHA256 hash of the code verifier
    const hash = createHash('sha256').update(codeVerifier).digest();

    // Convert hash to URL-safe base64
    return this.base64UrlEncode(hash);
  }

  /**
   * Encode buffer to URL-safe base64 string
   *
   * Converts a buffer to base64 and makes it URL-safe by:
   * - Replacing + with -
   * - Replacing / with _
   * - Removing trailing = padding
   *
   * @param buffer - Buffer to encode
   * @returns URL-safe base64 string
   * @private
   */
  private static base64UrlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
