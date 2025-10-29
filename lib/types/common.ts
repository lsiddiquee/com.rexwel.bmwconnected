/**
 * Common Types and Utilities
 *
 * Shared types and utility types used across the library.
 */

/**
 * Make all properties optional and nullable
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract non-nullable type
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Await helper type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Callback function type
 */
export type Callback<T = void> = (value: T) => void;

/**
 * Async callback function type
 */
export type AsyncCallback<T = void> = (value: T) => Promise<void>;

/**
 * Retry configuration
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Delay between retries in milliseconds
   */
  delayMs: number;

  /**
   * Whether to use exponential backoff
   */
  exponentialBackoff?: boolean;

  /**
   * Maximum delay in milliseconds (for exponential backoff)
   */
  maxDelayMs?: number;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /**
   * Page number (0-indexed)
   */
  page: number;

  /**
   * Number of items per page
   */
  pageSize: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  /**
   * Array of items for this page
   */
  items: T[];

  /**
   * Total number of items across all pages
   */
  total: number;

  /**
   * Current page number
   */
  page: number;

  /**
   * Number of items per page
   */
  pageSize: number;

  /**
   * Total number of pages
   */
  totalPages: number;

  /**
   * Whether there is a next page
   */
  hasNext: boolean;

  /**
   * Whether there is a previous page
   */
  hasPrevious: boolean;
}
