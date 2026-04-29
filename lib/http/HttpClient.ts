/**
 * HTTP client with retry logic, rate limiting, and interceptors
 *
 * Provides a robust HTTP client for making API requests with:
 * - Automatic retries with exponential backoff
 * - Rate limiting to prevent quota exhaustion
 * - Request/response interceptors for logging and auth
 * - Proper error mapping and handling
 * - Timeout support
 */

import {
  HttpClientOptions,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
  IHttpClient,
} from './IHttpClient';
import {
  ApiError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  VehicleClientError,
} from '../types/errors';
import { RetryConfig } from '../types/common';
import { RateLimiter } from './RateLimiter';
import { ILogger } from '../types';

// TODO: Remove when Node.js 16 support is dropped (Homey Pro 2016-2019 EOL)
// Polyfill fetch for Node.js < 18 (Homey Pro 2016-2019, Homey Bridge)
// Node.js 18+ (Homey Pro 2023) has native fetch
/* eslint-disable @typescript-eslint/no-require-imports */
if (typeof fetch === 'undefined') {
  require('cross-fetch/polyfill');
}
/* eslint-enable @typescript-eslint/no-require-imports */

export type RequestInterceptor = (request: HttpRequest) => HttpRequest | Promise<HttpRequest>;
export type ResponseInterceptor = <T>(
  response: HttpResponse<T>
) => HttpResponse<T> | Promise<HttpResponse<T>>;

/**
 * HTTP client implementation
 *
 * @example
 * ```typescript
 * const client = new HttpClient({
 *   baseUrl: 'https://api.example.com',
 *   timeout: 30000,
 *   maxRetries: 3,
 *   rateLimit: { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 }
 * });
 *
 * // Add auth interceptor
 * client.addRequestInterceptor(async (request) => {
 *   request.headers = request.headers || {};
 *   request.headers['Authorization'] = `Bearer ${token}`;
 *   return request;
 * });
 *
 * // Make request
 * const response = await client.get<UserData>('/users/me');
 * ```
 */
export class HttpClient implements IHttpClient {
  private readonly options: HttpClientOptions & { timeout: number; maxRetries: number };
  private readonly rateLimiter?: RateLimiter;
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];
  private readonly logger?: ILogger;

  /**
   * Create a new HTTP client
   *
   * @param options - Client configuration options
   */
  constructor(options: HttpClientOptions) {
    this.options = {
      baseUrl: options.baseUrl ?? '',
      defaultHeaders: options.defaultHeaders ?? {},
      timeout: options.timeout ?? 30000,
      maxRetries: options.maxRetries ?? 3,
      rateLimit: options.rateLimit,
    };
    this.logger = options.logger;

    if (this.options.rateLimit) {
      this.rateLimiter = new RateLimiter(this.options.rateLimit);
    }
  }

  /**
   * Add a request interceptor
   *
   * Interceptors are called in the order they were added.
   *
   * @param interceptor - Function to transform requests
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add a response interceptor
   *
   * Interceptors are called in the order they were added.
   *
   * @param interceptor - Function to transform responses
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Make a GET request
   */
  async get<T>(url: string, headers?: HttpHeaders): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers });
  }

  /**
   * Make a POST request
   */
  async post<T>(url: string, body?: unknown, headers?: HttpHeaders): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', url, body, headers });
  }

  /**
   * Make a PUT request
   */
  async put<T>(url: string, body?: unknown, headers?: HttpHeaders): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', url, body, headers });
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(url: string, body?: unknown, headers?: HttpHeaders): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, body, headers });
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(url: string, headers?: HttpHeaders): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, headers });
  }

  /**
   * Make a custom HTTP request
   *
   * @param request - Request configuration
   * @param rateLimitKey - Optional key for rate limiting (e.g., VIN)
   * @returns HTTP response
   */
  async request<T>(request: HttpRequest, rateLimitKey?: string): Promise<HttpResponse<T>> {
    // Check rate limit
    if (this.rateLimiter) {
      this.rateLimiter.checkLimit(rateLimitKey);
    }

    // Apply request interceptors
    let processedRequest = { ...request };
    for (const interceptor of this.requestInterceptors) {
      processedRequest = await interceptor(processedRequest);
    }

    // Execute request with retries
    const retryConfig: RetryConfig = {
      maxAttempts: this.options.maxRetries,
      delayMs: 1000,
      exponentialBackoff: true,
      maxDelayMs: 30000,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
      try {
        const response = await this.executeRequest<T>(processedRequest);

        // Record successful request for rate limiting
        if (this.rateLimiter) {
          this.rateLimiter.recordRequest(rateLimitKey);
        }

        // Apply response interceptors
        let processedResponse = response;
        for (const interceptor of this.responseInterceptors) {
          processedResponse = await interceptor(processedResponse);
        }

        return processedResponse;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (
          error instanceof RateLimitError ||
          (error instanceof VehicleClientError && error.statusCode === 401)
        ) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === retryConfig.maxAttempts - 1) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = retryConfig.exponentialBackoff
          ? Math.min(retryConfig.delayMs * Math.pow(2, attempt), retryConfig.maxDelayMs ?? Infinity)
          : retryConfig.delayMs;

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // All retries failed
    throw lastError ?? new NetworkError('Request failed after all retries');
  }

  /**
   * Execute a single HTTP request
   *
   * @param request - Request configuration
   * @returns HTTP response
   */
  private async executeRequest<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    // Build full URL
    const url = request.url.startsWith('http')
      ? request.url
      : `${this.options.baseUrl}${request.url}`;

    // Merge headers
    const headers: HttpHeaders = {
      ...this.options.defaultHeaders,
      ...request.headers,
    };

    // Add Content-Type for requests with body
    if (request.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: headers as HeadersInit,
    };

    // Add body for POST/PUT/PATCH
    if (request.body) {
      if (typeof request.body === 'string') {
        fetchOptions.body = request.body;
      } else {
        fetchOptions.body = JSON.stringify(request.body);
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Parse response body
      let data: T | undefined;
      const contentType = response.headers.get('Content-Type') ?? '';

      if (contentType.includes('application/json')) {
        data = (await response.json()) as T;
      } else if (contentType.includes('text/')) {
        data = (await response.text()) as unknown as T;
      }

      this.logger?.trace('HTTP Request', {
        method: request.method,
        url,
        status: response.status,
        data,
      });

      // Check for HTTP errors
      if (!response.ok) {
        throw this.mapHttpError(response.status, data, url);
      }

      // Build response object
      return {
        data: data as T,
        status: response.status,
        statusText: response.statusText,
        headers: this.parseHeaders(response.headers),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${this.options.timeout}ms`);
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`);
      }

      // Re-throw our custom errors
      if (error instanceof VehicleClientError) {
        throw error;
      }

      // Wrap unknown errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new NetworkError(`Request failed: ${errorMessage}`);
    }
  }

  /**
   * Map HTTP status codes to custom errors
   */
  private mapHttpError(status: number, data: unknown, url: string): VehicleClientError {
    const message = this.extractErrorMessage(data);

    switch (status) {
      case 401:
        return new ApiError(`Authentication failed: ${message}`, status, 'AUTH_ERROR');
      case 404:
        return new ApiError(`Resource not found: ${url}`, status, 'NOT_FOUND');
      case 429: {
        const retryAfter = this.extractRetryAfter(data);
        return new RateLimitError(`Rate limit exceeded: ${message}`, retryAfter);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        return new ApiError(`Server error: ${message}`, status, 'SERVER_ERROR');
      default:
        return new ApiError(`HTTP error ${status}: ${message}`, status, 'HTTP_ERROR');
    }
  }

  /**
   * Extract error message from response data
   */
  private extractErrorMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      return (obj.message ?? obj.error ?? obj.error_description ?? 'Unknown error') as string;
    }

    return 'Unknown error';
  }

  /**
   * Extract retry-after value from response data or headers
   */
  private extractRetryAfter(data: unknown): number {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.retry_after === 'number') {
        return obj.retry_after;
      }
      if (typeof obj.retryAfter === 'number') {
        return obj.retryAfter;
      }
    }

    return 60; // Default to 60 seconds
  }

  /**
   * Parse headers from Headers object to plain object
   */
  private parseHeaders(headers: Headers): HttpHeaders {
    const result: HttpHeaders = {};

    headers.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
