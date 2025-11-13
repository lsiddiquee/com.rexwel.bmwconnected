import { HomeyTokenStore } from '../../utils/HomeyTokenStore';
import { AuthToken } from '../../lib/models/AuthToken';
import { ILogger } from '../../lib/types/ILogger';
import Homey from 'homey/lib/Homey';

describe('HomeyTokenStore', () => {
  let mockHomey: jest.Mocked<Homey>;
  let mockLogger: jest.Mocked<ILogger>;
  let tokenStore: HomeyTokenStore;

  const testClientId = 'test-client-id-uuid';
  const testToken: AuthToken = {
    gcid: 'test-gcid',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    idToken: 'test-id-token',
    tokenType: 'Bearer',
    expiresAt: Date.now() / 1000 + 3600, // 1 hour from now
  };

  beforeEach(() => {
    // Arrange - Mock Homey settings
    const mockSettings: Record<string, unknown> = {};

    mockHomey = {
      settings: {
        set: jest.fn((key: string, value: unknown) => {
          mockSettings[key] = value;
        }),
        get: jest.fn((key: string) => mockSettings[key]),
        unset: jest.fn((key: string) => {
          delete mockSettings[key];
        }),
        getKeys: jest.fn(() => Object.keys(mockSettings)),
      },
    } as unknown as jest.Mocked<Homey>;

    // Mock logger
    mockLogger = {
      log: jest.fn(),
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as jest.Mocked<ILogger>;

    tokenStore = new HomeyTokenStore(mockHomey, mockLogger);
  });

  describe('storeToken', () => {
    it('should_storeToken_when_validTokenProvided', async () => {
      // Act
      await tokenStore.storeToken(testToken, testClientId);

      // Assert
      expect(mockHomey.settings.set).toHaveBeenCalledWith(`token_${testClientId}`, testToken);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `[HomeyTokenStore] Stored token for client ID: ${testClientId}`
      );
    });

    it('should_storeToken_when_noLoggerProvided', async () => {
      // Arrange
      const storeWithoutLogger = new HomeyTokenStore(mockHomey);

      // Act
      await storeWithoutLogger.storeToken(testToken, testClientId);

      // Assert
      expect(mockHomey.settings.set).toHaveBeenCalledWith(`token_${testClientId}`, testToken);
    });

    it('should_overwriteExistingToken_when_storingWithSameClientId', async () => {
      // Arrange
      const originalToken: AuthToken = {
        gcid: 'test-gcid',
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        idToken: 'old-id-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() / 1000 + 1800,
      };
      await tokenStore.storeToken(originalToken, testClientId);

      // Act
      await tokenStore.storeToken(testToken, testClientId);

      // Assert
      const retrieved = await tokenStore.retrieveToken(testClientId);
      expect(retrieved).toEqual(testToken);
      expect(retrieved?.accessToken).toBe('test-access-token');
    });

    it('should_storeMultipleTokens_when_differentClientIds', async () => {
      // Arrange
      const clientId1 = 'client-1';
      const clientId2 = 'client-2';
      const token1: AuthToken = { ...testToken, accessToken: 'token-1' };
      const token2: AuthToken = { ...testToken, accessToken: 'token-2' };

      // Act
      await tokenStore.storeToken(token1, clientId1);
      await tokenStore.storeToken(token2, clientId2);

      // Assert
      expect(mockHomey.settings.set).toHaveBeenCalledTimes(2);
      const retrieved1 = await tokenStore.retrieveToken(clientId1);
      const retrieved2 = await tokenStore.retrieveToken(clientId2);
      expect(retrieved1?.accessToken).toBe('token-1');
      expect(retrieved2?.accessToken).toBe('token-2');
    });
  });

  describe('retrieveToken', () => {
    it('should_returnToken_when_tokenExists', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, testClientId);

      // Act
      const result = await tokenStore.retrieveToken(testClientId);

      // Assert
      expect(result).toEqual(testToken);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `[HomeyTokenStore] Retrieved token for client ID: ${testClientId}`
      );
    });

    it('should_returnUndefined_when_tokenDoesNotExist', async () => {
      // Act
      const result = await tokenStore.retrieveToken('non-existent-client-id');

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[HomeyTokenStore] No token found for client ID: non-existent-client-id'
      );
    });

    it('should_returnUndefined_when_noLoggerProvided', async () => {
      // Arrange
      const storeWithoutLogger = new HomeyTokenStore(mockHomey);

      // Act
      const result = await storeWithoutLogger.retrieveToken('non-existent-client-id');

      // Assert
      expect(result).toBeUndefined();
    });

    it('should_retrieveCorrectToken_when_multipleTokensStored', async () => {
      // Arrange
      const clientId1 = 'client-1';
      const clientId2 = 'client-2';
      const token1: AuthToken = { ...testToken, accessToken: 'token-1' };
      const token2: AuthToken = { ...testToken, accessToken: 'token-2' };
      await tokenStore.storeToken(token1, clientId1);
      await tokenStore.storeToken(token2, clientId2);

      // Act
      const result = await tokenStore.retrieveToken(clientId2);

      // Assert
      expect(result?.accessToken).toBe('token-2');
    });
  });

  describe('deleteToken', () => {
    it('should_deleteToken_when_tokenExists', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, testClientId);

      // Act
      await tokenStore.deleteToken(testClientId);

      // Assert
      expect(mockHomey.settings.unset).toHaveBeenCalledWith(`token_${testClientId}`);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `[HomeyTokenStore] Deleted token for client ID: ${testClientId}`
      );
      const result = await tokenStore.retrieveToken(testClientId);
      expect(result).toBeUndefined();
    });

    it('should_notThrow_when_deletingNonExistentToken', async () => {
      // Act & Assert
      await expect(tokenStore.deleteToken('non-existent-client-id')).resolves.not.toThrow();
      expect(mockHomey.settings.unset).toHaveBeenCalledWith('token_non-existent-client-id');
    });

    it('should_deleteOnlySpecifiedToken_when_multipleTokensExist', async () => {
      // Arrange
      const clientId1 = 'client-1';
      const clientId2 = 'client-2';
      const token1: AuthToken = { ...testToken, accessToken: 'token-1' };
      const token2: AuthToken = { ...testToken, accessToken: 'token-2' };
      await tokenStore.storeToken(token1, clientId1);
      await tokenStore.storeToken(token2, clientId2);

      // Act
      await tokenStore.deleteToken(clientId1);

      // Assert
      const result1 = await tokenStore.retrieveToken(clientId1);
      const result2 = await tokenStore.retrieveToken(clientId2);
      expect(result1).toBeUndefined();
      expect(result2?.accessToken).toBe('token-2');
    });
  });

  describe('hasToken', () => {
    it('should_returnTrue_when_tokenExists', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, testClientId);

      // Act
      const result = await tokenStore.hasToken(testClientId);

      // Assert
      expect(result).toBe(true);
    });

    it('should_returnFalse_when_tokenDoesNotExist', async () => {
      // Act
      const result = await tokenStore.hasToken('non-existent-client-id');

      // Assert
      expect(result).toBe(false);
    });

    it('should_returnFalse_when_tokenWasDeleted', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, testClientId);
      await tokenStore.deleteToken(testClientId);

      // Act
      const result = await tokenStore.hasToken(testClientId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getStoredClientIds', () => {
    it('should_returnEmptyArray_when_noTokensStored', () => {
      // Act
      const result = tokenStore.getStoredClientIds();

      // Assert
      expect(result).toEqual([]);
    });

    it('should_returnClientIds_when_tokensStored', async () => {
      // Arrange
      const clientId1 = 'client-1';
      const clientId2 = 'client-2';
      await tokenStore.storeToken(testToken, clientId1);
      await tokenStore.storeToken(testToken, clientId2);

      // Act
      const result = tokenStore.getStoredClientIds();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('client-1');
      expect(result).toContain('client-2');
    });

    it('should_filterOutNonTokenKeys_when_mixedSettingsExist', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, testClientId);
      mockHomey.settings.set('some_other_setting', 'value');
      mockHomey.settings.set('app_version', '1.0.0');

      // Act
      const result = tokenStore.getStoredClientIds();

      // Assert
      expect(result).toEqual([testClientId]);
    });

    it('should_returnUpdatedList_when_tokenAdded', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, 'client-1');

      // Act - First check
      let result = tokenStore.getStoredClientIds();
      expect(result).toHaveLength(1);

      // Act - Add another token
      await tokenStore.storeToken(testToken, 'client-2');
      result = tokenStore.getStoredClientIds();

      // Assert
      expect(result).toHaveLength(2);
    });

    it('should_returnUpdatedList_when_tokenDeleted', async () => {
      // Arrange
      await tokenStore.storeToken(testToken, 'client-1');
      await tokenStore.storeToken(testToken, 'client-2');

      // Act - Delete one token
      await tokenStore.deleteToken('client-1');
      const result = tokenStore.getStoredClientIds();

      // Assert
      expect(result).toEqual(['client-2']);
    });
  });

  describe('getTokenKey (private method behavior)', () => {
    it('should_useCorrectKeyFormat_when_storingAndRetrieving', async () => {
      // Arrange
      const clientId = 'my-uuid-1234';

      // Act
      await tokenStore.storeToken(testToken, clientId);

      // Assert - Verify the key format is correct
      expect(mockHomey.settings.set).toHaveBeenCalledWith('token_my-uuid-1234', testToken);
    });
  });

  describe('Integration scenarios', () => {
    it('should_handleCompleteLifecycle_storeRetrieveDelete', async () => {
      // Arrange & Act - Store
      await tokenStore.storeToken(testToken, testClientId);
      const hasTokenAfterStore = await tokenStore.hasToken(testClientId);

      // Act - Retrieve
      const retrieved = await tokenStore.retrieveToken(testClientId);

      // Act - Delete
      await tokenStore.deleteToken(testClientId);
      const hasTokenAfterDelete = await tokenStore.hasToken(testClientId);

      // Assert
      expect(hasTokenAfterStore).toBe(true);
      expect(retrieved).toEqual(testToken);
      expect(hasTokenAfterDelete).toBe(false);
    });

    it('should_handleMultipleClientIds_independently', async () => {
      // Arrange
      const clients = ['client-1', 'client-2', 'client-3'];
      const tokens = clients.map((id) => ({
        ...testToken,
        accessToken: `token-${id}`,
      }));

      // Act - Store all
      for (let i = 0; i < clients.length; i++) {
        await tokenStore.storeToken(tokens[i], clients[i]);
      }

      // Assert - All stored
      expect(tokenStore.getStoredClientIds()).toHaveLength(3);

      // Act - Delete middle one
      await tokenStore.deleteToken(clients[1]);

      // Assert - Others remain
      expect(tokenStore.getStoredClientIds()).toHaveLength(2);
      expect(await tokenStore.hasToken(clients[0])).toBe(true);
      expect(await tokenStore.hasToken(clients[1])).toBe(false);
      expect(await tokenStore.hasToken(clients[2])).toBe(true);
    });
  });
});
