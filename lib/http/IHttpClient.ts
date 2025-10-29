/**
 * HTTP Client Interface
 *
 * Defines the contract for HTTP client implementations.
 * Supports request/response interception, retries, and rate limiting.
 */

import { ILogger } from '../types';

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * HTTP headers
 */
export interface HttpHeaders {
  [key: string]: string;
}

/**
 * HTTP request configuration
 */
export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers?: HttpHeaders;
  body?: unknown;
  timeout?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: HttpHeaders;
  data: T;
}

/**
 * HTTP client options
 */
export interface HttpClientOptions {
  /**
   * Base URL for all requests
   */
  baseUrl?: string;

  /**
   * Default headers to include in all requests
   */
  defaultHeaders?: HttpHeaders;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts
   */
  maxRetries?: number;

  /**
   * Rate limiting configuration
   */
  rateLimit?: RateLimitConfig;

  /**
   * Logger for logging requests and responses
   */
  logger?: ILogger;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed
   */
  maxRequests: number;

  /**
   * Time window in milliseconds
   */
  windowMs: number;
}

/**
 * Main HTTP client interface
 */
export interface IHttpClient {
  /**
   * Execute an HTTP GET request
   *
   * @param url - Request URL
   * @param headers - Optional request headers
   * @returns Promise resolving to HTTP response
   */
  get<T = unknown>(url: string, headers?: HttpHeaders): Promise<HttpResponse<T>>;

  /**
   * Execute an HTTP POST request
   *
   * @param url - Request URL
   * @param body - Request body
   * @param headers - Optional request headers
   * @returns Promise resolving to HTTP response
   */
  post<T = unknown>(url: string, body?: unknown, headers?: HttpHeaders): Promise<HttpResponse<T>>;

  /**
   * Execute an HTTP PUT request
   *
   * @param url - Request URL
   * @param body - Request body
   * @param headers - Optional request headers
   * @returns Promise resolving to HTTP response
   */
  put<T = unknown>(url: string, body?: unknown, headers?: HttpHeaders): Promise<HttpResponse<T>>;

  /**
   * Execute an HTTP PATCH request
   *
   * @param url - Request URL
   * @param body - Request body
   * @param headers - Optional request headers
   * @returns Promise resolving to HTTP response
   */
  patch<T = unknown>(url: string, body?: unknown, headers?: HttpHeaders): Promise<HttpResponse<T>>;

  /**
   * Execute an HTTP DELETE request
   *
   * @param url - Request URL
   * @param headers - Optional request headers
   * @returns Promise resolving to HTTP response
   */
  delete<T = unknown>(url: string, headers?: HttpHeaders): Promise<HttpResponse<T>>;

  /**
   * Execute a custom HTTP request
   *
   * @param request - Request configuration
   * @returns Promise resolving to HTTP response
   */
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
}
