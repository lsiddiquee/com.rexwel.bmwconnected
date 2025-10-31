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
      await expect(httpClient.get('/test')).rejects.toThrow('Rate limit exceeded');
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
});
