/**
 * Comprehensive Unit Tests for PkceGenerator
 *
 * Tests PKCE (Proof Key for Code Exchange) implementation to improve coverage from 20% to 90%+
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PkceGenerator } from '../../../lib/auth/PkceGenerator';

// Mock crypto module functions - proper hoisting
jest.mock('crypto', () => ({
  createHash: jest.fn(),
  randomBytes: jest.fn(),
}));

describe('PkceGenerator - Comprehensive Tests', () => {
  let mockHashUpdate: jest.Mock;
  let mockHashDigest: jest.Mock;
  let mockCreateHash: jest.Mock;
  let mockRandomBytes: jest.Mock;

  beforeEach(async () => {
    // Import mocked functions after mocking
    const crypto = await import('crypto');
    mockCreateHash = crypto.createHash as jest.Mock;
    mockRandomBytes = crypto.randomBytes as jest.Mock;

    // Setup mock implementations
    mockHashUpdate = jest.fn().mockReturnThis();
    mockHashDigest = jest.fn().mockReturnValue(Buffer.from('mock-hash-digest', 'utf8')); // Return Buffer

    mockCreateHash.mockReturnValue({
      update: mockHashUpdate,
      digest: mockHashDigest,
    });

    // Mock randomBytes to return a predictable buffer
    const mockBuffer = Buffer.from('a'.repeat(32), 'utf8');
    mockRandomBytes.mockReturnValue(mockBuffer);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Code Verifier Generation', () => {
    it('should_generateRandomCodeVerifier_when_called', () => {
      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result).toBeDefined();
      expect(result.codeVerifier).toBeDefined();
      expect(typeof result.codeVerifier).toBe('string');
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it('should_generateUniqueVerifiers_on_multipleCalls', () => {
      // Arrange - Mock different random bytes for each call
      const buffer1 = Buffer.from('a'.repeat(32), 'utf8');
      const buffer2 = Buffer.from('b'.repeat(32), 'utf8');
      mockRandomBytes.mockReturnValueOnce(buffer1).mockReturnValueOnce(buffer2);

      // Act
      const result1 = PkceGenerator.generate();
      const result2 = PkceGenerator.generate();

      // Assert
      expect(result1.codeVerifier).not.toBe(result2.codeVerifier);
    });

    it('should_useUrlSafeBase64Encoding_for_verifier', () => {
      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.codeVerifier).not.toContain('+');
      expect(result.codeVerifier).not.toContain('/');
      expect(result.codeVerifier).not.toContain('=');
    });

    it('should_generateCompliantLength_for_verifier', () => {
      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(result.codeVerifier.length).toBeLessThanOrEqual(128);
    });
  });

  describe('Code Challenge Derivation', () => {
    it('should_createSHA256Challenge_when_generating', () => {
      // Act
      PkceGenerator.generate();

      // Assert
      expect(mockCreateHash).toHaveBeenCalledWith('sha256');
      expect(mockHashUpdate).toHaveBeenCalled();
      expect(mockHashDigest).toHaveBeenCalledWith(); // No arguments for digest()
    });

    it('should_returnS256Method_when_generating', () => {
      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result.codeChallengeMethod).toBe('S256');
    });

    it('should_useUrlSafeBase64Encoding_for_challenge', () => {
      // Arrange
      mockHashDigest.mockReturnValue(Buffer.from('aGVsbG8gd29ybGQ+', 'base64'));

      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(result.codeChallenge).not.toContain('+');
      expect(result.codeChallenge).not.toContain('/');
      expect(result.codeChallenge).not.toContain('=');
    });
  });

  describe('Security & Compliance', () => {
    it('should_complywithRFC7636_specification', () => {
      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(result.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(result.codeChallengeMethod).toBe('S256');
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it('should_generateSecureRandomness_for_verifier', () => {
      // Act
      PkceGenerator.generate();

      // Assert
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it('should_handleCryptoErrors_gracefully', () => {
      // Arrange
      mockRandomBytes.mockImplementation(() => {
        throw new Error('Crypto error');
      });

      // Act & Assert
      expect(() => PkceGenerator.generate()).toThrow('Crypto error');
    });
  });

  describe('Static Method Behavior', () => {
    it('should_beAccessibleAsStaticMethod', () => {
      // Assert
      expect(typeof PkceGenerator.generate).toBe('function');
    });

    it('should_returnPkceChallengeInterface', () => {
      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result).toHaveProperty('codeVerifier');
      expect(result).toHaveProperty('codeChallenge');
      expect(result).toHaveProperty('codeChallengeMethod');
    });

    it('should_notRequireInstantiation', () => {
      // Act & Assert - Should not throw
      expect(() => PkceGenerator.generate()).not.toThrow();
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should_handleEmptyBuffer_gracefully', () => {
      // Arrange
      mockRandomBytes.mockReturnValue(Buffer.alloc(0));

      // Act
      const result = PkceGenerator.generate();

      // Assert
      expect(result).toBeDefined();
    });

    it('should_handleHashFailure_appropriately', () => {
      // Arrange
      mockCreateHash.mockImplementation(() => {
        throw new Error('Hash creation failed');
      });

      // Act & Assert
      expect(() => PkceGenerator.generate()).toThrow('Hash creation failed');
    });

    it('should_maintainConsistency_across_calls', () => {
      // Arrange
      const buffer = Buffer.from('consistent-data', 'utf8');
      mockRandomBytes.mockReturnValue(buffer);
      mockHashDigest.mockReturnValue(Buffer.from('consistent-hash', 'utf8'));

      // Act
      const result1 = PkceGenerator.generate();
      const result2 = PkceGenerator.generate();

      // Assert
      expect(result1.codeChallengeMethod).toBe(result2.codeChallengeMethod);
      expect(result1.codeChallengeMethod).toBe('S256');
    });

    it('should_generateWithinTimeConstraints', () => {
      // Arrange
      const startTime = Date.now();

      // Act
      PkceGenerator.generate();
      const endTime = Date.now();

      // Assert - Should complete within reasonable time (1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
