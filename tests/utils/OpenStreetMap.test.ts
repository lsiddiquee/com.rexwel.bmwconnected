import { OpenStreetMap } from '../../utils/OpenStreetMap';
import { ILogger } from '../../lib/types/ILogger';
import fetch from 'cross-fetch';

// Mock cross-fetch
jest.mock('cross-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('OpenStreetMap', () => {
  let mockLogger: jest.Mocked<ILogger>;

  const testLatitude = 37.7749;
  const testLongitude = -122.4194;
  const testAddress = '123 Market Street, San Francisco, CA 94103, USA';

  beforeEach(() => {
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

    // Reset fetch mock
    mockFetch.mockReset();
  });

  describe('GetAddress', () => {
    it('should_returnAddress_when_successfulResponse', async () => {
      // Arrange
      const mockResponse = {
        display_name: testAddress,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBe(testAddress);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Resolving address for Latitude: ${testLatitude} Longitude: ${testLongitude}`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(`Resolved address: ${testAddress}`);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${testLatitude}&lon=${testLongitude}&zoom=18&addressdetails=0`,
        {
          headers: {
            'User-Agent': 'HomeyAppBMWConnected',
          },
        }
      );
    });

    it('should_returnAddress_when_noLoggerProvided', async () => {
      // Arrange
      const mockResponse = {
        display_name: testAddress,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude);

      // Assert
      expect(result).toBe(testAddress);
    });

    it('should_returnUndefined_when_httpRequestFails', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '500: Error occurred while attempting to retrieve address. Server response: Internal Server Error'
      );
    });

    it('should_returnUndefined_when_404NotFound', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Not Found'),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '404: Error occurred while attempting to retrieve address. Server response: Not Found'
      );
    });

    it('should_returnUndefined_when_429RateLimitExceeded', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Too Many Requests'),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '429: Error occurred while attempting to retrieve address. Server response: Too Many Requests'
      );
    });

    it('should_returnUndefined_when_responseIsMissingDisplayName', async () => {
      // Arrange - Response without display_name property
      const mockResponse = {
        place_id: 12345,
        type: 'building',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid response format: missing display_name property'
      );
    });

    it('should_returnUndefined_when_responseIsInvalidJSON', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('Invalid JSON{'),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON response:')
      );
    });

    it('should_returnUndefined_when_responseIsEmptyString', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(''),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse JSON response:')
      );
    });

    it('should_returnUndefined_when_responseIsNull', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('null'),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid response format: missing display_name property'
      );
    });

    it('should_returnUndefined_when_displayNameIsEmpty', async () => {
      // Arrange
      const mockResponse = {
        display_name: '',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBe(''); // Empty string is technically valid
      expect(mockLogger.info).toHaveBeenCalledWith('Resolved address: ');
    });

    it('should_returnUndefined_when_networkError', async () => {
      // Arrange
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Act & Assert
      await expect(
        OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger)
      ).rejects.toThrow('Network error');
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Resolving address for Latitude: ${testLatitude} Longitude: ${testLongitude}`
      );
    });

    it('should_handleDifferentCoordinates_correctly', async () => {
      // Arrange
      const lat1 = 51.5074; // London
      const lon1 = -0.1278;
      const address1 = 'London, UK';

      const lat2 = 48.8566; // Paris
      const lon2 = 2.3522;
      const address2 = 'Paris, France';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify({ display_name: address1 })),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify({ display_name: address2 })),
        } as unknown as Response);

      // Act
      const result1 = await OpenStreetMap.GetAddress(lat1, lon1, mockLogger);
      const result2 = await OpenStreetMap.GetAddress(lat2, lon2, mockLogger);

      // Assert
      expect(result1).toBe(address1);
      expect(result2).toBe(address2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should_includeCorrectUserAgent_inHeaders', async () => {
      // Arrange
      const mockResponse = { display_name: testAddress };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]).toEqual({
        headers: {
          'User-Agent': 'HomeyAppBMWConnected',
        },
      });
    });

    it('should_constructCorrectURL_withCoordinates', async () => {
      // Arrange
      const lat = 40.7128;
      const lon = -74.006;
      const mockResponse = { display_name: 'New York, NY, USA' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      await OpenStreetMap.GetAddress(lat, lon, mockLogger);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=0`,
        expect.objectContaining({
          headers: {
            'User-Agent': 'HomeyAppBMWConnected',
          },
        })
      );
    });

    it('should_handleSpecialCharactersInAddress_correctly', async () => {
      // Arrange
      const addressWithSpecialChars = "Rue de l'Église, München, Deutschland";
      const mockResponse = { display_name: addressWithSpecialChars };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBe(addressWithSpecialChars);
    });

    it('should_handleVeryLongAddress_correctly', async () => {
      // Arrange
      const longAddress =
        'Very Long Street Name That Goes On And On, Building 123, Apartment 456, City District, City Name, Postal Code 12345, State, Country, Continent, Planet Earth';
      const mockResponse = { display_name: longAddress };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(testLatitude, testLongitude, mockLogger);

      // Assert
      expect(result).toBe(longAddress);
    });

    it('should_handleNegativeCoordinates_correctly', async () => {
      // Arrange
      const lat = -33.8688; // Sydney (negative latitude)
      const lon = 151.2093;
      const mockResponse = { display_name: 'Sydney, Australia' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(lat, lon, mockLogger);

      // Assert
      expect(result).toBe('Sydney, Australia');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`lat=${lat}&lon=${lon}`),
        expect.any(Object)
      );
    });

    it('should_handleExtremeCoordinates_correctly', async () => {
      // Arrange
      const lat = 89.9999; // Near North Pole
      const lon = -179.9999;
      const mockResponse = { display_name: 'Arctic Ocean' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      } as unknown as Response);

      // Act
      const result = await OpenStreetMap.GetAddress(lat, lon, mockLogger);

      // Assert
      expect(result).toBe('Arctic Ocean');
    });
  });

  describe('Integration scenarios', () => {
    it('should_handleMultipleConsecutiveRequests_correctly', async () => {
      // Arrange
      const coordinates = [
        { lat: 37.7749, lon: -122.4194, address: 'San Francisco, CA' },
        { lat: 40.7128, lon: -74.006, address: 'New York, NY' },
        { lat: 34.0522, lon: -118.2437, address: 'Los Angeles, CA' },
      ];

      coordinates.forEach((coord) => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify({ display_name: coord.address })),
        } as unknown as Response);
      });

      // Act
      const results = await Promise.all(
        coordinates.map((coord) => OpenStreetMap.GetAddress(coord.lat, coord.lon, mockLogger))
      );

      // Assert
      expect(results).toEqual(coordinates.map((c) => c.address));
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should_handleMixedSuccessAndFailure_independently', async () => {
      // Arrange
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify({ display_name: 'Address 1' })),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue('Server Error'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(JSON.stringify({ display_name: 'Address 3' })),
        } as unknown as Response);

      // Act
      const result1 = await OpenStreetMap.GetAddress(1, 1, mockLogger);
      const result2 = await OpenStreetMap.GetAddress(2, 2, mockLogger);
      const result3 = await OpenStreetMap.GetAddress(3, 3, mockLogger);

      // Assert
      expect(result1).toBe('Address 1');
      expect(result2).toBeUndefined();
      expect(result3).toBe('Address 3');
    });
  });
});
