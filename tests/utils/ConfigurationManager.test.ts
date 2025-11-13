/**
 * Tests for ConfigurationManager
 *
 * Validates configuration get/set and caching behavior.
 */

import { ConfigurationManager } from '../../utils/ConfigurationManager';
import { Configuration } from '../../utils/Configuration';
import { LogLevel } from '../../lib';

describe('ConfigurationManager', () => {
  let mockHomey: any;
  let mockSettings: Map<string, any>;

  beforeEach(() => {
    // Reset cache before each test
    ConfigurationManager.configurationCache = undefined as any;

    // Create mock settings storage
    mockSettings = new Map();

    // Create mock Homey instance
    mockHomey = {
      settings: {
        get: jest.fn((key: string) => mockSettings.get(key)),
        set: jest.fn((key: string, value: any) => mockSettings.set(key, value)),
      },
    };
  });

  describe('getConfiguration', () => {
    it('should_returnConfiguration_when_existsInSettings', () => {
      // Arrange
      const config = new Configuration();
      config.logEnabled = true;
      config.logLevel = LogLevel.DEBUG;
      mockSettings.set(ConfigurationManager._settingsKey, config);

      // Act
      const result = ConfigurationManager.getConfiguration(mockHomey);

      // Assert
      expect(result).toBe(config);
      expect(result.logEnabled).toBe(true);
      expect(result.logLevel).toBe(LogLevel.DEBUG);
      expect(mockHomey.settings.get).toHaveBeenCalledWith(ConfigurationManager._settingsKey);
    });

    it('should_cacheConfiguration_when_firstLoad', () => {
      // Arrange
      const config = new Configuration();
      mockSettings.set(ConfigurationManager._settingsKey, config);

      // Act
      const result1 = ConfigurationManager.getConfiguration(mockHomey);
      const result2 = ConfigurationManager.getConfiguration(mockHomey);

      // Assert
      expect(result1).toBe(result2); // Same instance (cached)
      expect(mockHomey.settings.get).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should_returnUndefined_when_noConfigurationExists', () => {
      // Arrange
      // No configuration in settings

      // Act
      const result = ConfigurationManager.getConfiguration(mockHomey);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should_returnConfigurationWithGeofences_when_geofencesSet', () => {
      // Arrange
      const config = new Configuration();
      config.geofences = [
        {
          label: 'Home',
          latitude: 51.5074,
          longitude: -0.1278,
          address: '123 Main St',
          radius: 50,
        },
        {
          label: 'Work',
          latitude: 51.5134,
          longitude: -0.0896,
          address: '456 Office Rd',
          radius: 100,
        },
      ];
      mockSettings.set(ConfigurationManager._settingsKey, config);

      // Act
      const result = ConfigurationManager.getConfiguration(mockHomey);

      // Assert
      expect(result.geofences).toHaveLength(2);
      expect(result.geofences[0].label).toBe('Home');
      expect(result.geofences[1].label).toBe('Work');
    });
  });

  describe('setConfiguration', () => {
    it('should_saveConfiguration_when_called', () => {
      // Arrange
      const config = new Configuration();
      config.logEnabled = true;
      config.logLevel = LogLevel.INFO;

      // Act
      ConfigurationManager.setConfiguration(mockHomey, config);

      // Assert
      expect(mockHomey.settings.set).toHaveBeenCalledWith(
        ConfigurationManager._settingsKey,
        config
      );
      expect(mockSettings.get(ConfigurationManager._settingsKey)).toBe(config);
    });

    it('should_updateCache_when_configurationSet', () => {
      // Arrange
      const config1 = new Configuration();
      config1.logEnabled = false;

      const config2 = new Configuration();
      config2.logEnabled = true;

      // Act
      ConfigurationManager.setConfiguration(mockHomey, config1);
      const cached1 = ConfigurationManager.configurationCache;

      ConfigurationManager.setConfiguration(mockHomey, config2);
      const cached2 = ConfigurationManager.configurationCache;

      // Assert
      expect(cached1).toBe(config1);
      expect(cached2).toBe(config2);
      expect(cached1).not.toBe(cached2);
    });

    it('should_persistConfigurationVersion_when_set', () => {
      // Arrange
      const config = new Configuration();
      config.currentVersion = '1.2.3';

      // Act
      ConfigurationManager.setConfiguration(mockHomey, config);
      const retrieved = ConfigurationManager.getConfiguration(mockHomey);

      // Assert
      expect(retrieved.currentVersion).toBe('1.2.3');
    });

    it('should_persistGeofences_when_set', () => {
      // Arrange
      const config = new Configuration();
      config.geofences = [
        {
          label: 'Office',
          latitude: 40.7128,
          longitude: -74.006,
          address: '1 Corporate Plaza',
          radius: 75,
        },
      ];

      // Act
      ConfigurationManager.setConfiguration(mockHomey, config);
      const retrieved = ConfigurationManager.getConfiguration(mockHomey);

      // Assert
      expect(retrieved.geofences).toHaveLength(1);
      expect(retrieved.geofences[0].label).toBe('Office');
      expect(retrieved.geofences[0].radius).toBe(75);
    });
  });

  describe('_settingsKey', () => {
    it('should_haveCorrectSettingsKey_when_accessed', () => {
      // Arrange & Act
      const key = ConfigurationManager._settingsKey;

      // Assert
      expect(key).toBe('com.rexwel.bmwconnected');
    });
  });
});
