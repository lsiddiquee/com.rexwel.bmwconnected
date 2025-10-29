/**
 * Tests for Error Classes
 *
 * Validates error instantiation, inheritance, properties, and context handling.
 */

import {
  VehicleClientError,
  AuthenticationError,
  ApiError,
  VehicleNotFoundError,
  RateLimitError,
  NetworkError,
  TokenStorageError,
  ValidationError,
  TimeoutError,
} from '../../../lib/types/errors';

describe('VehicleClientError', () => {
  it('should_createBasicError_when_onlyMessageProvided', () => {
    // Arrange & Act
    const error = new VehicleClientError('Something went wrong');

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error.message).toBe('Something went wrong');
    expect(error.name).toBe('VehicleClientError');
    expect(error.code).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
    expect(error.context).toBeUndefined();
  });

  it('should_createErrorWithAllProperties_when_allParametersProvided', () => {
    // Arrange & Act
    const context = { requestId: 'abc123', endpoint: '/api/vehicles' };
    const error = new VehicleClientError('Request failed', 'REQUEST_FAILED', 500, context);

    // Assert
    expect(error.message).toBe('Request failed');
    expect(error.code).toBe('REQUEST_FAILED');
    expect(error.statusCode).toBe(500);
    expect(error.context).toEqual(context);
  });

  it('should_haveStackTrace_when_errorCreated', () => {
    // Arrange & Act
    const error = new VehicleClientError('Test error');

    // Assert
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('VehicleClientError');
  });
});

describe('AuthenticationError', () => {
  it('should_createAuthError_when_messageProvided', () => {
    // Arrange & Act
    const error = new AuthenticationError('Invalid credentials');

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe('Invalid credentials');
    expect(error.name).toBe('AuthenticationError');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBeUndefined();
  });

  it('should_includeCodeAndContext_when_provided', () => {
    // Arrange & Act
    const context = { username: 'test@example.com' };
    const error = new AuthenticationError('Token expired', 'TOKEN_EXPIRED', context);

    // Assert
    expect(error.message).toBe('Token expired');
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(error.statusCode).toBe(401);
    expect(error.context).toEqual(context);
  });
});

describe('ApiError', () => {
  it('should_createApiError_when_messageProvided', () => {
    // Arrange & Act
    const error = new ApiError('API request failed');

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('API request failed');
    expect(error.name).toBe('ApiError');
    expect(error.statusCode).toBeUndefined();
  });

  it('should_includeStatusCode_when_provided', () => {
    // Arrange & Act
    const error = new ApiError('Bad request', 400, 'INVALID_PARAMS');

    // Assert
    expect(error.message).toBe('Bad request');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('INVALID_PARAMS');
  });

  it('should_include500StatusCode_when_serverError', () => {
    // Arrange & Act
    const context = { endpoint: '/api/telematic', method: 'GET' };
    const error = new ApiError('Internal server error', 500, 'SERVER_ERROR', context);

    // Assert
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('SERVER_ERROR');
    expect(error.context).toEqual(context);
  });
});

describe('VehicleNotFoundError', () => {
  it('should_createVehicleNotFoundError_when_vinProvided', () => {
    // Arrange & Act
    const vin = 'WBADT43452G296706';
    const error = new VehicleNotFoundError(vin);

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(VehicleNotFoundError);
    expect(error.message).toBe(`Vehicle not found: ${vin}`);
    expect(error.name).toBe('VehicleNotFoundError');
    expect(error.code).toBe('VEHICLE_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.context).toEqual({ vin });
  });
});

describe('RateLimitError', () => {
  it('should_createRateLimitError_when_messageProvided', () => {
    // Arrange & Act
    const error = new RateLimitError('Too many requests');

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toBe('Too many requests');
    expect(error.name).toBe('RateLimitError');
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBeUndefined();
  });

  it('should_includeRetryAfter_when_provided', () => {
    // Arrange & Act
    const error = new RateLimitError('Rate limit exceeded', 3600);

    // Assert
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.retryAfter).toBe(3600);
    expect(error.context).toEqual({ retryAfter: 3600 });
  });

  it('should_includeContextWithRetryAfter_when_contextProvided', () => {
    // Arrange & Act
    const context = { requestCount: 51, dailyLimit: 50 };
    const error = new RateLimitError('Daily limit exceeded', 86400, context);

    // Assert
    expect(error.retryAfter).toBe(86400);
    expect(error.context).toEqual({
      requestCount: 51,
      dailyLimit: 50,
      retryAfter: 86400,
    });
  });
});

describe('NetworkError', () => {
  it('should_createNetworkError_when_messageProvided', () => {
    // Arrange & Act
    const error = new NetworkError('Connection refused');

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toBe('Connection refused');
    expect(error.name).toBe('NetworkError');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.statusCode).toBeUndefined();
    expect(error.originalError).toBeUndefined();
  });

  it('should_includeOriginalError_when_provided', () => {
    // Arrange
    const originalError = new Error('ECONNREFUSED');

    // Act
    const error = new NetworkError('Failed to connect to server', originalError);

    // Assert
    expect(error.message).toBe('Failed to connect to server');
    expect(error.originalError).toBe(originalError);
    expect(error.context).toEqual({ originalError: 'ECONNREFUSED' });
  });
});

describe('TokenStorageError', () => {
  it('should_createTokenStorageError_when_messageProvided', () => {
    // Arrange & Act
    const error = new TokenStorageError('Failed to save token');

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(TokenStorageError);
    expect(error.message).toBe('Failed to save token');
    expect(error.name).toBe('TokenStorageError');
    expect(error.code).toBe('TOKEN_STORAGE_ERROR');
    expect(error.statusCode).toBeUndefined();
  });

  it('should_includeOriginalError_when_provided', () => {
    // Arrange
    const originalError = new Error('Disk full');

    // Act
    const error = new TokenStorageError('Cannot write to storage', originalError);

    // Assert
    expect(error.message).toBe('Cannot write to storage');
    expect(error.context).toEqual({ originalError: 'Disk full' });
  });
});

describe('ValidationError', () => {
  it('should_createValidationError_when_messageProvided', () => {
    // Arrange & Act
    const error = new ValidationError('Invalid input');

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe('Invalid input');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.field).toBeUndefined();
  });

  it('should_includeField_when_provided', () => {
    // Arrange & Act
    const error = new ValidationError('VIN must be 17 characters', 'vin');

    // Assert
    expect(error.message).toBe('VIN must be 17 characters');
    expect(error.field).toBe('vin');
    expect(error.context).toEqual({ field: 'vin' });
  });
});

describe('TimeoutError', () => {
  it('should_createTimeoutError_when_messageProvided', () => {
    // Arrange & Act
    const error = new TimeoutError('Request timed out');

    // Assert
    expect(error).toBeInstanceOf(VehicleClientError);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toBe('Request timed out');
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('TIMEOUT');
    expect(error.statusCode).toBe(408);
    expect(error.timeoutMs).toBeUndefined();
  });

  it('should_includeTimeoutMs_when_provided', () => {
    // Arrange & Act
    const error = new TimeoutError('Operation exceeded timeout', 30000);

    // Assert
    expect(error.message).toBe('Operation exceeded timeout');
    expect(error.timeoutMs).toBe(30000);
    expect(error.context).toEqual({ timeoutMs: 30000 });
  });
});
