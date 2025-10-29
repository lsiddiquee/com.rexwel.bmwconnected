/**
 * Tests for UnitConverter
 *
 * Validates distance and fuel unit conversions.
 */

import { UnitConverter } from '../../utils/UnitConverter';

describe('UnitConverter', () => {
  describe('ConvertDistance', () => {
    it('should_returnOriginalValue_when_metricUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertDistance(100, 'metric');

      // Assert
      expect(result).toBe(100);
    });

    it('should_convertKmToMiles_when_imperialUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertDistance(100, 'imperial');

      // Assert
      // 100 km = 62.1371 miles, rounded to 62
      expect(result).toBe(62);
    });

    it('should_handleZeroDistance_when_metricUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertDistance(0, 'metric');

      // Assert
      expect(result).toBe(0);
    });

    it('should_handleZeroDistance_when_imperialUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertDistance(0, 'imperial');

      // Assert
      expect(result).toBe(0);
    });

    it('should_roundCorrectly_when_convertingToMiles', () => {
      // Arrange & Act
      // 161 km = 100.04 miles, should round to 100
      const result1 = UnitConverter.ConvertDistance(161, 'imperial');
      // 162 km = 100.66 miles, should round to 101
      const result2 = UnitConverter.ConvertDistance(162, 'imperial');

      // Assert
      expect(result1).toBe(100);
      expect(result2).toBe(101);
    });

    it('should_handleLargeDistances_when_imperialUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertDistance(500000, 'imperial');

      // Assert
      // 500,000 km = 310,685.5 miles, rounded to 310,686
      expect(result).toBe(310686);
    });
  });

  describe('ConvertFuel', () => {
    it('should_returnOriginalValue_when_literUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(50, 'liter');

      // Assert
      expect(result).toBe(50);
    });

    it('should_convertLitersToUSGallons_when_gallonUSUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(50, 'gallonUS');

      // Assert
      // 50 L = 13.2086 US gal, rounded to 13
      expect(result).toBe(13);
    });

    it('should_convertLitersToUKGallons_when_gallonUKUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(50, 'gallonUK');

      // Assert
      // 50 L = 10.99845 UK gal, rounded to 11
      expect(result).toBe(11);
    });

    it('should_handleZeroFuel_when_literUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(0, 'liter');

      // Assert
      expect(result).toBe(0);
    });

    it('should_handleZeroFuel_when_gallonUSUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(0, 'gallonUS');

      // Assert
      expect(result).toBe(0);
    });

    it('should_handleZeroFuel_when_gallonUKUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(0, 'gallonUK');

      // Assert
      expect(result).toBe(0);
    });

    it('should_roundCorrectly_when_convertingToUSGallons', () => {
      // Arrange & Act
      // 1 L = 0.264172 US gal, should round to 0
      const result1 = UnitConverter.ConvertFuel(1, 'gallonUS');
      // 4 L = 1.056688 US gal, should round to 1
      const result2 = UnitConverter.ConvertFuel(4, 'gallonUS');

      // Assert
      expect(result1).toBe(0);
      expect(result2).toBe(1);
    });

    it('should_roundCorrectly_when_convertingToUKGallons', () => {
      // Arrange & Act
      // 1 L = 0.219969 UK gal, should round to 0
      const result1 = UnitConverter.ConvertFuel(1, 'gallonUK');
      // 5 L = 1.099845 UK gal, should round to 1
      const result2 = UnitConverter.ConvertFuel(5, 'gallonUK');

      // Assert
      expect(result1).toBe(0);
      expect(result2).toBe(1);
    });

    it('should_handleLargeFuelAmount_when_gallonUSUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(1000, 'gallonUS');

      // Assert
      // 1000 L = 264.172 US gal, rounded to 264
      expect(result).toBe(264);
    });

    it('should_handleLargeFuelAmount_when_gallonUKUnit', () => {
      // Arrange & Act
      const result = UnitConverter.ConvertFuel(1000, 'gallonUK');

      // Assert
      // 1000 L = 219.969 UK gal, rounded to 220
      expect(result).toBe(220);
    });
  });
});
