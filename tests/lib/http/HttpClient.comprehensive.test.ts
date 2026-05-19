/**
 * Comprehensive Unit Tests for HttpClient
 *
 * Tests HTTP client implementation to improve coverage from 2.97% to 80%+:
 * - Constructor and configuration
 * - HTTP methods (GET, POST, PUT, PATCH, DELETE)
 * - Request/response interceptors
 * - Retry logic with exponential backoff
 * - Rate limiting integration
 * - Error handling and mapping
 * - Timeout handling
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import {
  HttpClient,
  type RequestInterceptor,
  type ResponseInterceptor,
} from '../../../lib/http/HttpClient';
import type { HttpClientOptions, HttpRequest } from '../../../lib/http/IHttpClient';
import type { ILogger } from '../../../lib/types/ILogger';
import { RateLimiter } from '../../../lib/http/RateLimiter';
import { ApiError, NetworkError, RateLimitError, TimeoutError } from '../../../lib/types/errors';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock RateLimiter
jest.mock('../../../lib/http/RateLimiter');
const MockedRateLimiter = RateLimiter as jest.MockedClass<typeof RateLimiter>;

describe('HttpClient - Comprehensive Tests', () => {
  let httpClient: HttpClient;
  let mockLogger: jest.Mocked<ILogger>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let clientOptions: HttpClientOptions;

  // Helper function to create a mock Response
  const createMockResponse = (
    data: any,
    status = 200,
    headers: Record<string, string> = {},
    contentType = 'application/json'
  ): Response => {
    const headersMap = new Map([['Content-Type', contentType], ...Object.entries(headers)]);

    const response = {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: {
        get: jest.fn((key: string) => headersMap.get(key) || null),
        forEach: jest.fn((callback: (value: string, key: string) => void) => {
          headersMap.forEach(callback);
        }),
      },
      json: jest.fn<() => Promise<any>>().mockResolvedValue(data),
      text: jest
        .fn<() => Promise<string>>()
        .mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data)),
    } as any as Response;

    return response;
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockFetch.mockClear();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn(),
    } as any;

    // Mock rate limiter
    mockRateLimiter = {
      checkLimit: jest.fn(),
      recordRequest: jest.fn(),
      getRequestCount: jest.fn(),
      getTimeUntilReset: jest.fn(),
      reset: jest.fn(),
    } as any;

    MockedRateLimiter.mockImplementation(() => mockRateLimiter);

    // Default client options
    clientOptions = {
      baseUrl: 'https://api.example.com',
      defaultHeaders: { 'User-Agent': 'Test-Client' },
      timeout: 5000,
      maxRetries: 2,
      logger: mockLogger,
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constructor & Configuration', () => {
    it('should_createClient_when_allOptionsProvided', () => {
      // Act
      const client = new HttpClient(clientOptions);

      // Assert
      expect(client).toBeDefined();
      expect(client.get).toBeDefined();
      expect(client.post).toBeDefined();
      expect(client.put).toBeDefined();
      expect(client.patch).toBeDefined();
      expect(client.delete).toBeDefined();
      expect(client.request).toBeDefined();
    });

    it('should_useDefaults_when_minimalOptionsProvided', () => {
      // Arrange
      const minimalOptions: HttpClientOptions = {};

      // Act
      const client = new HttpClient(minimalOptions);

      // Assert
      expect(client).toBeDefined();
      // Should not throw and create client with defaults
    });

    it('should_createRateLimiter_when_rateLimitConfigProvided', () => {
      // Arrange
      const optionsWithRateLimit: HttpClientOptions = {
        ...clientOptions,
        rateLimit: { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 },
      };

      // Act
      new HttpClient(optionsWithRateLimit);

      // Assert
      expect(MockedRateLimiter).toHaveBeenCalledWith({
        maxRequests: 50,
        windowMs: 24 * 60 * 60 * 1000,
      });
    });

    it('should_notCreateRateLimiter_when_rateLimitConfigOmitted', () => {
      // Act
      new HttpClient(clientOptions);

      // Assert
      expect(MockedRateLimiter).not.toHaveBeenCalled();
    });
  });

  describe('HTTP Methods', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));
    });

    it('should_makeGetRequest_when_getCalled', async () => {
      // Arrange
      const headers = { 'X-Custom': 'test' };

      // Act
      const response = await httpClient.get<{ success: boolean }>('/test', headers);

      // Assert
      expect(response).toBeDefined();
      expect(response.data).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': 'Test-Client',
            'X-Custom': 'test',
          }),
        })
      );
    });

    it('should_makePostRequest_when_postCalled', async () => {
      // Arrange
      const body = { name: 'test', value: 123 };
      const headers = { 'X-Custom': 'test' };

      // Act
      const response = await httpClient.post<{ success: boolean }>('/test', body, headers);

      // Assert
      expect(response.data).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'User-Agent': 'Test-Client',
            'X-Custom': 'test',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(body),
        })
      );
    });

    it('should_makePutRequest_when_putCalled', async () => {
      // Arrange
      const body = { id: 1, name: 'updated' };

      // Act
      await httpClient.put('/test/1', body);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body),
        })
      );
    });

    it('should_makePatchRequest_when_patchCalled', async () => {
      // Arrange
      const body = { name: 'patched' };

      // Act
      await httpClient.patch('/test/1', body);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      );
    });

    it('should_makeDeleteRequest_when_deleteCalled', async () => {
      // Arrange
      const headers = { 'X-Confirm': 'true' };

      // Act
      await httpClient.delete('/test/1', headers);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test/1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'X-Confirm': 'true',
          }),
        })
      );
    });

    it('should_handleAbsoluteUrls_when_fullUrlProvided', async () => {
      // Act
      await httpClient.get('https://other-api.example.com/test');

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://other-api.example.com/test',
        expect.any(Object)
      );
    });

    it('should_handleStringBody_when_stringProvided', async () => {
      // Arrange
      const stringBody = 'raw string data';

      // Act
      await httpClient.post('/test', stringBody);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          body: stringBody,
        })
      );
    });
  });

  describe('Request/Response Interceptors', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
      mockFetch.mockResolvedValue(createMockResponse({ intercepted: true }));
    });

    it('should_applyRequestInterceptor_when_interceptorAdded', async () => {
      // Arrange
      const interceptor: RequestInterceptor = jest.fn((request: HttpRequest): HttpRequest => {
        request.headers = request.headers || {};
        request.headers['X-Intercepted'] = 'true';
        return request;
      }) as RequestInterceptor;

      httpClient.addRequestInterceptor(interceptor);

      // Act
      await httpClient.get('/test');

      // Assert
      expect(interceptor).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Intercepted': 'true',
          }),
        })
      );
    });

    it('should_applyAsyncRequestInterceptor_when_interceptorReturnsPromise', async () => {
      // Arrange
      const interceptor: RequestInterceptor = jest.fn(
        async (request: HttpRequest): Promise<HttpRequest> => {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async work
          request.headers = request.headers || {};
          request.headers['X-Async'] = 'true';
          return request;
        }
      ) as RequestInterceptor;

      httpClient.addRequestInterceptor(interceptor);

      // Act
      await httpClient.get('/test');

      // Assert
      expect(interceptor).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Async': 'true',
          }),
        })
      );
    });

    it('should_applyResponseInterceptor_when_interceptorAdded', async () => {
      // Arrange
      const interceptor: ResponseInterceptor = jest.fn((response: any) => {
        response.headers['X-Response-Intercepted'] = 'true';
        return response;
      }) as ResponseInterceptor;

      httpClient.addResponseInterceptor(interceptor);

      // Act
      const response = await httpClient.get('/test');

      // Assert
      expect(interceptor).toHaveBeenCalled();
      expect(response.headers['X-Response-Intercepted']).toBe('true');
    });

    it('should_applyMultipleInterceptors_when_multipleAdded', async () => {
      // Arrange
      const requestInterceptor1: RequestInterceptor = jest.fn(
        (request: HttpRequest): HttpRequest => {
          request.headers = request.headers || {};
          request.headers['X-First'] = 'true';
          return request;
        }
      ) as RequestInterceptor;

      const requestInterceptor2: RequestInterceptor = jest.fn(
        (request: HttpRequest): HttpRequest => {
          request.headers = request.headers || {};
          request.headers['X-Second'] = 'true';
          return request;
        }
      ) as RequestInterceptor;

      httpClient.addRequestInterceptor(requestInterceptor1);
      httpClient.addRequestInterceptor(requestInterceptor2);

      // Act
      await httpClient.get('/test');

      // Assert
      expect(requestInterceptor1).toHaveBeenCalled();
      expect(requestInterceptor2).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-First': 'true',
            'X-Second': 'true',
          }),
        })
      );
    });
  });

  describe('Rate Limiting Integration', () => {
    beforeEach(() => {
      const optionsWithRateLimit: HttpClientOptions = {
        ...clientOptions,
        rateLimit: { maxRequests: 50, windowMs: 24 * 60 * 60 * 1000 },
      };
      httpClient = new HttpClient(optionsWithRateLimit);
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));
    });

    it('should_checkRateLimit_when_rateLimiterConfigured', async () => {
      // Act
      await httpClient.request({ method: 'GET', url: '/test' }, 'test-key');

      // Assert
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('test-key');
    });

    it('should_recordRequest_when_requestSucceeds', async () => {
      // Act
      await httpClient.request({ method: 'GET', url: '/test' }, 'test-key');

      // Assert
      expect(mockRateLimiter.recordRequest).toHaveBeenCalledWith('test-key');
    });

    it('should_throwRateLimitError_when_rateLimitExceeded', async () => {
      // Arrange
      const rateLimitError = new RateLimitError('Rate limit exceeded', 60);
      mockRateLimiter.checkLimit.mockImplementation(() => {
        throw rateLimitError;
      });

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(RateLimitError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should_notRecordRequest_when_requestFails', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow();
      expect(mockRateLimiter.recordRequest).not.toHaveBeenCalled();
    });
  });

  describe('Retry Logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      httpClient = new HttpClient({ ...clientOptions, maxRetries: 3 });
    });

    it('should_retryRequest_when_networkErrorOccurs', async () => {
      // Arrange
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce(createMockResponse({ success: true }));

      // Act
      const responsePromise = httpClient.get('/test');

      // Fast-forward through retry delays
      for (let i = 0; i < 2; i++) {
        await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, i));
      }

      const response = await responsePromise;

      // Assert
      expect(response.data).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should_notRetryOn401Error_when_authenticationFails', async () => {
      // Arrange
      const authError = new ApiError('Unauthorized', 401, 'AUTH_ERROR');
      mockFetch.mockRejectedValue(authError);

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(ApiError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should_notRetryOnRateLimitError_when_rateLimitExceeded', async () => {
      // Arrange
      const rateLimitError = new RateLimitError('Rate limit exceeded', 60);
      mockFetch.mockRejectedValue(rateLimitError);

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(RateLimitError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should_useExponentialBackoff_when_retrying', async () => {
      // Arrange
      mockFetch
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockRejectedValueOnce(new TypeError('Network error'))
        .mockResolvedValueOnce(createMockResponse({ success: true }));

      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(startTime);

      // Act
      const responsePromise = httpClient.get('/test');

      // Fast-forward through exponential backoff delays (1s, 2s)
      await jest.advanceTimersByTimeAsync(1000); // First retry after 1s
      await jest.advanceTimersByTimeAsync(2000); // Second retry after 2s

      await responsePromise;

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should_failAfterMaxRetries_when_allRetriesFail', async () => {
      // Arrange
      const networkError = new TypeError('Persistent network error');
      mockFetch.mockRejectedValue(networkError); // All attempts fail with same error

      // Act
      const responsePromise = httpClient.get('/test');
      const handledPromise = responsePromise.catch((error) => error);

      // Fast-forward through exponential backoff delays (1s, 2s)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);

      // Assert
      const error = await handledPromise;
      expect(error).toBeInstanceOf(NetworkError);
      expect((error as Error).message).toBe('Network error: Persistent network error');
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
    });
  });

  describe('Error Handling & Mapping', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
    });

    it('should_throwTimeoutError_when_requestTimesOut', async () => {
      // Arrange
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(TimeoutError);
      await expect(httpClient.get('/test')).rejects.toThrow('Request timeout after 5000ms');
    });

    it('should_throwApiError_when_401Response', async () => {
      // Arrange
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Unauthorized' }, 401));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(ApiError);
      await expect(httpClient.get('/test')).rejects.toThrow('Authentication failed');
    });

    it('should_throwApiError_when_404Response', async () => {
      // Arrange
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Not found' }, 404));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(ApiError);
      await expect(httpClient.get('/test')).rejects.toThrow('Resource not found');
    });

    it('should_throwRateLimitError_when_429Response', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        createMockResponse({ error: 'Too many requests', retry_after: 30 }, 429)
      );

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(RateLimitError);
      // Issue #108: message wording updated to reference BMW's daily quota,
      // since this client only talks to BMW CarData.
      await expect(httpClient.get('/test')).rejects.toThrow(/rate limit/i);
    });

    it('should_throwApiError_when_5xxResponse', async () => {
      // Arrange
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Internal server error' }, 500));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(ApiError);
      await expect(httpClient.get('/test')).rejects.toThrow('Server error');
    });

    it('should_extractErrorMessage_when_errorObjectProvided', async () => {
      // Arrange
      const errorResponse = { message: 'Custom error message' };
      mockFetch.mockResolvedValue(createMockResponse(errorResponse, 400));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow('Custom error message');
    });

    // Regression: issue #108 - BMW CarData returns structured errors like
    // `{ code: 'CU-105', message: 'No permission for container' }` on 403 responses.
    // Previously the HttpClient dropped the BMW `code` field and surfaced
    // "HTTP error 403: Unknown error", making CarDataClient's CU-105 branch unreachable.
    it('should_preserveBmwErrorCode_when_403WithCodeField', async () => {
      // Arrange - simulate a BMW CU-105 (no container permission) response
      mockFetch.mockResolvedValue(
        createMockResponse(
          {
            code: 'CU-105',
            message: 'No permission for specified containerId',
          },
          403
        )
      );

      // Act
      const error = await httpClient.get('/test').catch((e: unknown) => e);

      // Assert - error must expose the BMW code and message, not "Unknown error"
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(403);
      expect((error as ApiError).code).toBe('CU-105');
      expect((error as Error).message).toContain('No permission for specified containerId');
      expect((error as Error).message).not.toContain('Unknown error');
    });

    it('should_handleStringErrorResponse_gracefully', async () => {
      // Arrange
      mockFetch.mockResolvedValue(createMockResponse('String error message', 400));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow('String error message');
    });

    it('should_throwNetworkError_when_fetchThrowsTypeError', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      // Act & Assert
      await expect(httpClient.get('/test')).rejects.toThrow(NetworkError);
      await expect(httpClient.get('/test')).rejects.toThrow('Network error');
    });
  });

  describe('Response Parsing', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
    });

    it('should_parseJsonResponse_when_contentTypeIsJson', async () => {
      // Arrange
      const responseData = { id: 1, name: 'test' };
      mockFetch.mockResolvedValue(createMockResponse(responseData, 200, {}, 'application/json'));

      // Act
      const response = await httpClient.get('/test');

      // Assert
      expect(response.data).toEqual(responseData);
    });

    it('should_parseTextResponse_when_contentTypeIsText', async () => {
      // Arrange
      const textData = 'Plain text response';
      const mockResponse = createMockResponse(textData, 200, {}, 'text/plain');
      (mockResponse as any).text = jest.fn<() => Promise<string>>().mockResolvedValue(textData);
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const response = await httpClient.get('/test');

      // Assert
      expect(response.data).toBe(textData);
    });

    it('should_handleEmptyResponse_when_noContentType', async () => {
      // Arrange
      const mockResponse = createMockResponse(undefined, 200, {}, '');
      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const response = await httpClient.get('/test');

      // Assert
      expect(response.data).toBeUndefined();
    });

    it('should_includeResponseHeaders_when_responseReceived', async () => {
      // Arrange
      const headers = { 'X-Custom-Header': 'custom-value' };
      const mockResponse = createMockResponse({ success: true }, 200, headers);

      // Override the headers.forEach mock to properly iterate
      (mockResponse.headers as any).forEach = jest.fn(
        (callback: (value: string, key: string) => void) => {
          callback('application/json', 'Content-Type');
          callback('custom-value', 'X-Custom-Header');
        }
      );

      mockFetch.mockResolvedValue(mockResponse);

      // Act
      const response = await httpClient.get('/test');

      // Assert
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      });
    });
  });

  describe('Logging Integration', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));
    });

    it('should_logTraceInfo_when_requestCompletes', async () => {
      // Act
      await httpClient.get('/test');

      // Assert
      expect(mockLogger.trace).toHaveBeenCalledWith('HTTP Request', {
        method: 'GET',
        url: 'https://api.example.com/test',
        status: 200,
        data: { success: true },
      });
    });

    it('should_notLog_when_loggerNotProvided', async () => {
      // Arrange
      const clientWithoutLogger = new HttpClient({ baseUrl: 'https://api.example.com' });

      // Act
      await clientWithoutLogger.get('/test');

      // Assert
      // Should not throw and complete successfully without logger
    });
  });

  // Regression: issue #108 (v1.0.17 -> v1.0.18).
  // The diagnostic detail (method/url/status/headers/body) was being passed as
  // the *Error* argument to Logger.error, which only extracts `.message`/`.stack`.
  // The user-submitted logs therefore showed bare `[ERROR] HTTP request failed {}`.
  // The fix moves the diagnostics to the 3rd `context` argument so they survive
  // serialization.
  describe('Diagnostic logging (issue #108)', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
    });

    it('should_passDiagnosticsAsContextArg_when_requestFails', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        createMockResponse({ message: 'Forbidden' }, 403, { 'x-correlation-id': 'srv-corr-1' })
      );

      // Act
      await httpClient.get('/customers/containers').catch(() => undefined);

      // Assert - third argument must contain the full diagnostic envelope
      expect(mockLogger.error).toHaveBeenCalled();
      const call = mockLogger.error.mock.calls.find((args) => args[0] === 'HTTP request failed') as
        | unknown[]
        | undefined;
      expect(call).toBeDefined();
      const context = call![2] as Record<string, unknown>;
      expect(context).toMatchObject({
        method: 'GET',
        status: 403,
        statusText: expect.any(String),
      });
      expect(String(context.url)).toContain('/customers/containers');
      expect(context.headers).toBeDefined();
      // The second (Error) arg must be undefined - we don't have a real Error here.
      expect(call![1]).toBeUndefined();
    });
  });

  // Issue #108 follow-up: include a client-generated correlation ID on every
  // request so user-submitted logs can be matched across the HTTP layer and the
  // BMW gateway even when BMW omits its own correlation header.
  describe('Client correlation ID (issue #108)', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
    });

    it('should_sendClientCorrelationIdHeader_when_makingRequest', async () => {
      // Arrange
      mockFetch.mockResolvedValue(createMockResponse({ ok: true }));

      // Act
      await httpClient.get('/test');

      // Assert
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      const correlationHeader =
        headers['x-correlation-id'] ?? headers['X-Correlation-Id'] ?? headers['X-Correlation-ID'];
      expect(correlationHeader).toBeDefined();
      expect(typeof correlationHeader).toBe('string');
      expect(correlationHeader.length).toBeGreaterThan(0);
    });

    it('should_includeClientCorrelationIdInError_when_serverOmitsHeader', async () => {
      // Arrange - server response WITHOUT x-correlation-id header
      mockFetch.mockResolvedValue(createMockResponse({ message: 'Bad request' }, 400));

      // Act
      const error = (await httpClient.get('/test').catch((e: unknown) => e)) as Error;

      // Assert - error message must surface a correlation marker so the user
      // can correlate the log entry with the surfaced UI/Homey error.
      expect(error.message.toLowerCase()).toContain('correlation');
    });
  });

  // Issue #108: silvinnio reported the existing 403-container hint ("check
  // that the Streaming API option is enabled") was misleading because their
  // BMW client already had both API toggles enabled. v1.0.18 softens the
  // phrasing so it acknowledges the option might already be on and points
  // the user at the correlation ID for support escalation instead of stating
  // the toggle is definitely missing.
  describe('Container 403 hint phrasing (issue #108)', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
    });

    it('should_useNonAccusatoryStreamingHint_when_403OnContainersEndpoint', async () => {
      // Arrange
      mockFetch.mockResolvedValue(createMockResponse({ message: 'Forbidden' }, 403));

      // Act
      const error = (await httpClient
        .get('/customers/containers')
        .catch((e: unknown) => e)) as Error;

      // Assert - message must still mention the Streaming API option (it IS
      // the most common cause) but with softer phrasing that allows for the
      // toggle already being enabled, and must reference the correlation ID.
      expect(error.message).toContain('Streaming API');
      // Old wording asserted the option was missing ("check that ... is enabled").
      // New wording must use a verb like 'verify' that doesn't presume fault.
      expect(error.message.toLowerCase()).toMatch(/verify|confirm/);
      expect(error.message.toLowerCase()).toContain('correlation');
    });
  });

  // Issue #108 (v1.0.18 follow-up): BMW maps the daily 50-request quota to
  // HTTP 403 with body `{ exveErrorCode: '"CU-429"', exveErrorMsg: '"API rate
  // limit reached."' }` (values are doubly-string-encoded by the gateway).
  // Previously this surfaced as a generic 403 with the "verify Streaming API"
  // hint, which sent users chasing a non-existent permission problem when the
  // real cause was that their rolling 24h window was exhausted.
  describe('BMW rate-limit detection (issue #108)', () => {
    beforeEach(() => {
      httpClient = new HttpClient(clientOptions);
    });

    it('should_returnRateLimitError_when_403WithExveErrorCodeCU429', async () => {
      // Arrange - BMW gateway shape with doubly-quoted string values
      mockFetch.mockResolvedValue(
        createMockResponse(
          {
            AccessDeniedException: 'User is not authorized to access this resource',
            'x-amzn-errortype': 'AccessDeniedException',
            exveErrorCode: '"CU-429"',
            exveErrorMsg: '"API rate limit reached."',
          },
          403
        )
      );

      // Act
      const error = await httpClient.get('/customers/containers').catch((e: unknown) => e);

      // Assert - must be classified as RateLimitError, not a generic ApiError.
      // The BMW code is stashed in context (the public `code` field on
      // RateLimitError is the taxonomy code 'RATE_LIMIT_EXCEEDED').
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).context).toMatchObject({ bmwCode: 'CU-429' });
    });

    it('should_notIncludeStreamingApiHint_when_403IsActuallyCu429RateLimit', async () => {
      // Arrange - same CU-429 shape on the container endpoint
      mockFetch.mockResolvedValue(
        createMockResponse(
          {
            exveErrorCode: '"CU-429"',
            exveErrorMsg: '"API rate limit reached."',
          },
          403
        )
      );

      // Act
      const error = (await httpClient
        .get('/customers/containers')
        .catch((e: unknown) => e)) as Error;

      // Assert - must NOT chase the user toward the Streaming API toggle.
      // Must reference the daily 50-request limit so the user knows to wait.
      expect(error.message).not.toContain('Streaming API');
      expect(error.message).toMatch(/rate limit|50 requests|24h|24 hours/i);
    });

    it('should_extractExveErrorMessage_when_bodyUsesBmwGatewayShape', async () => {
      // Arrange - quote-stripping must work so the surfaced message reads
      // "API rate limit reached." not '"API rate limit reached."'.
      mockFetch.mockResolvedValue(
        createMockResponse(
          {
            exveErrorCode: '"CU-429"',
            exveErrorMsg: '"API rate limit reached."',
          },
          403
        )
      );

      // Act
      const error = (await httpClient.get('/test').catch((e: unknown) => e)) as Error;

      // Assert - message includes the BMW phrasing without the wrapping quotes
      expect(error.message).toContain('API rate limit reached.');
      expect(error.message).not.toContain('""');
    });
  });
});
