/**
 * Custom Error Types
 *
 * Structured error classes for better error handling and debugging.
 */

/**
 * Base error class for all library errors
 */
export class VehicleClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VehicleClientError';
    Object.setPrototypeOf(this, VehicleClientError.prototype);
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends VehicleClientError {
  constructor(message: string, code?: string, context?: Record<string, unknown>) {
    super(message, code, 401, context);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * API request errors
 */
export class ApiError extends VehicleClientError {
  constructor(
    message: string,
    statusCode?: number,
    code?: string,
    context?: Record<string, unknown>
  ) {
    super(message, code, statusCode, context);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Vehicle not found error
 */
export class VehicleNotFoundError extends VehicleClientError {
  constructor(vin: string) {
    super(`Vehicle not found: ${vin}`, 'VEHICLE_NOT_FOUND', 404, { vin });
    this.name = 'VehicleNotFoundError';
    Object.setPrototypeOf(this, VehicleNotFoundError.prototype);
  }
}

/**
 * Rate limiting error
 */
export class RateLimitError extends VehicleClientError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { ...context, retryAfter });
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Network/connectivity error
 */
export class NetworkError extends VehicleClientError {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message, 'NETWORK_ERROR', undefined, { originalError: originalError?.message });
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Token storage error
 */
export class TokenStorageError extends VehicleClientError {
  constructor(message: string, originalError?: Error) {
    super(message, 'TOKEN_STORAGE_ERROR', undefined, { originalError: originalError?.message });
    this.name = 'TokenStorageError';
    Object.setPrototypeOf(this, TokenStorageError.prototype);
  }
}

/**
 * Validation error
 */
export class ValidationError extends VehicleClientError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends VehicleClientError {
  constructor(
    message: string,
    public readonly timeoutMs?: number
  ) {
    super(message, 'TIMEOUT', 408, { timeoutMs });
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}
