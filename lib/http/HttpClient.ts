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

    // Generate a client-side correlation ID for this request so user-submitted
    // logs can be matched across the HTTP layer and the error surfaced to the
    // UI, even when the upstream gateway omits its own correlation header.
    // Issue #108.
    const clientCorrelationId = this.generateCorrelationId();

    // Merge headers
    const headers: HttpHeaders = {
      ...this.options.defaultHeaders,
      ...request.headers,
      'x-correlation-id': clientCorrelationId,
    };

    // Add Content-Type for requests with body
    if (request.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
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
      let rawBody: string | undefined;
      const contentType = response.headers.get('Content-Type') ?? '';

      if (!response.ok) {
        // For errors, always read raw text first so we can include the actual body
        // in logs even when the server omits/lies about Content-Type. Issue #108.
        rawBody = await response.text();
        if (rawBody && contentType.includes('application/json')) {
          try {
            data = JSON.parse(rawBody) as T;
          } catch {
            // Body claimed to be JSON but isn't parseable; fall back to raw text
            // so the error mapper still has *something* to surface. Issue #108.
            data = rawBody as unknown as T;
          }
        } else if (rawBody) {
          data = rawBody as unknown as T;
        }
      } else if (contentType.includes('application/json')) {
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
        const responseHeaders = this.parseHeaders(response.headers);
        // Log full diagnostic detail (headers + raw body) so users can copy the
        // log entry from the Homey app's log view into a GitHub issue — logs
        // are local-only and never sent to a central service. Issue #108.
        // The diagnostics MUST be passed as the 3rd `context` argument - the
        // Logger only extracts `.message`/`.stack` from the 2nd Error arg, so
        // earlier versions of this call site (v1.0.17) silently dropped them.
        this.logger?.error('HTTP request failed', undefined, {
          method: request.method,
          url,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: rawBody,
          clientCorrelationId,
        });
        throw this.mapHttpError(response.status, data, url, responseHeaders, clientCorrelationId);
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
  private mapHttpError(
    status: number,
    data: unknown,
    url: string,
    headers?: HttpHeaders,
    clientCorrelationId?: string
  ): VehicleClientError {
    const rawMessage = this.extractErrorMessage(data);
    // Preserve BMW-specific error codes (e.g. CU-105, CU-429) from the response
    // body so downstream handlers (CarDataClient container errors, rate-limit
    // classification below) can react. Issue #108.
    const bmwCode = this.extractErrorCode(data);
    // BMW responses include a correlation/request ID header that's required for
    // their support team to investigate. Surface it in the message when the body
    // gives us nothing actionable. Issue #108.
    const serverCorrelationId = this.extractCorrelationId(headers);
    // Always include *some* correlation ID in the surfaced error: prefer the
    // upstream one when present, otherwise the client-generated ID we put on
    // the request. This lets users grep the same identifier from the surfaced
    // Homey error back into the diagnostic log entry. Issue #108.
    const correlationToken = serverCorrelationId ?? clientCorrelationId;
    const correlationSuffix = correlationToken ? ` (correlation: ${correlationToken})` : '';

    // BMW maps the daily 50-request quota to HTTP 403 with `exveErrorCode`
    // "CU-429" — NOT to HTTP 429. Detect this *before* falling through to the
    // generic 403/Streaming-API branch so users get an actionable message
    // instead of being sent to check a permission toggle. Issue #108.
    if (bmwCode === 'CU-429' || status === 429) {
      const retryAfter = this.extractRetryAfter(data, headers);
      const detail = rawMessage && rawMessage !== 'Unknown error' ? `: ${rawMessage}` : '';
      return new RateLimitError(
        `BMW CarData daily rate limit reached (50 requests / 24h per user)${detail}. ` +
          `Wait for the rolling 24-hour window to free up before retrying. Each pairing ` +
          `attempt and background poll counts toward the limit.${correlationSuffix}`,
        retryAfter,
        { bmwCode, httpStatus: status, url }
      );
    }

    // For the container 403 case (issue #108), append a next-step hint. The
    // most common cause is the BMW CarData client missing the 'Streaming API'
    // scope, but the toggle can already be enabled and a 403 still occurs —
    // so the wording must not presume fault and must point the user at this
    // app's repo (BMW support cannot help with a third-party Homey app).
    // Skip the hint entirely when we already know it's a CU-429 (handled above).
    const containerHint =
      status === 403 && url.includes('/customers/containers')
        ? " - if the 'Streaming API' option on your BMW CarData client is already enabled, open a GitHub issue on the Homey app's repository and include the log entry from the Homey app's log view"
        : '';
    const message = `${rawMessage}${correlationSuffix}${containerHint}`;

    switch (status) {
      case 401:
        return new ApiError(`Authentication failed: ${message}`, status, bmwCode ?? 'AUTH_ERROR');
      case 404:
        return new ApiError(`Resource not found: ${url}`, status, bmwCode ?? 'NOT_FOUND');
      case 500:
      case 502:
      case 503:
      case 504:
        return new ApiError(`Server error: ${message}`, status, bmwCode ?? 'SERVER_ERROR');
      default:
        return new ApiError(`HTTP error ${status}: ${message}`, status, bmwCode ?? 'HTTP_ERROR');
    }
  }

  /**
   * Generate a client-side correlation ID for outbound requests. Format is a
   * short, log-friendly random token (not a full UUID) so it's easy to copy
   * from Homey error toasts and grep in the diagnostic logs. Issue #108.
   */
  private generateCorrelationId(): string {
    // 12 hex chars + 4-char timestamp suffix is plenty to disambiguate within
    // a single user's session while staying readable.
    const rand = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    const ts = (Date.now() & 0xffff).toString(16).padStart(4, '0');
    return `cli-${rand}-${ts}`;
  }

  /**
   * Extract a correlation / request ID from response headers. BMW CarData uses
   * `x-correlation-id`; other gateways may use `x-request-id`. Issue #108.
   */
  private extractCorrelationId(headers?: HttpHeaders): string | undefined {
    if (!headers) return undefined;
    const candidates = ['x-correlation-id', 'x-request-id', 'request-id', 'correlation-id'];
    for (const [key, value] of Object.entries(headers)) {
      if (candidates.includes(key.toLowerCase()) && typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
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
      // BMW CarData returns `{ code, message }` for application errors and
      // `{ exveErrorCode, exveErrorMsg }` for gateway errors (issue #108).
      // Gateway values are sometimes doubly-string-encoded (e.g. `'"CU-429"'`),
      // so strip wrapping quotes when present. Fall through several common
      // shapes so we never lose the server-provided detail.
      const candidate =
        obj.message ??
        obj.error_description ??
        obj.detail ??
        obj.title ??
        (typeof obj.error === 'string' ? obj.error : undefined) ??
        (typeof obj.exveErrorMsg === 'string'
          ? this.stripWrappingQuotes(obj.exveErrorMsg)
          : undefined) ??
        (typeof obj.code === 'string' ? obj.code : undefined) ??
        (typeof obj.exveErrorCode === 'string'
          ? this.stripWrappingQuotes(obj.exveErrorCode)
          : undefined);
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }

    return 'Unknown error';
  }

  /**
   * Extract a BMW-specific error code from the response body, when present.
   * Handles both the application-level `code` field and the gateway's
   * `exveErrorCode` field (which is sometimes wrapped in literal quotes).
   * Returns undefined for unstructured bodies so callers can fall back to
   * their own default codes. Issue #108.
   */
  private extractErrorCode(data: unknown): string | undefined {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.code === 'string' && obj.code.length > 0) {
        return obj.code;
      }
      if (typeof obj.exveErrorCode === 'string' && obj.exveErrorCode.length > 0) {
        const stripped = this.stripWrappingQuotes(obj.exveErrorCode);
        if (stripped.length > 0) {
          return stripped;
        }
      }
    }
    return undefined;
  }

  /**
   * Strip a single pair of wrapping ASCII double-quotes from a string. BMW's
   * API gateway double-encodes some string values (`'"CU-429"'`) which would
   * otherwise leak literal quote characters into surfaced messages. Issue #108.
   */
  private stripWrappingQuotes(value: string): string {
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }
    return value;
  }

  /**
   * Extract retry-after value from response data or headers. Falls back to
   * a long default for BMW's daily quota so callers don't retry aggressively.
   */
  private extractRetryAfter(data: unknown, headers?: HttpHeaders): number {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.retry_after === 'number') {
        return obj.retry_after;
      }
      if (typeof obj.retryAfter === 'number') {
        return obj.retryAfter;
      }
    }
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === 'retry-after' && typeof value === 'string') {
          const parsed = parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
          }
        }
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
