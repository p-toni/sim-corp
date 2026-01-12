/**
 * Cache interfaces and types
 */

/**
 * Cache backend type
 */
export type CacheBackend = 'memory' | 'redis';

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache backend to use */
  backend: CacheBackend;

  /** Default time-to-live in seconds (optional) */
  ttl?: number;

  /** Key prefix for all cache keys (optional) */
  prefix?: string;

  /** Redis connection options (required for redis backend) */
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };

  /** Memory cache options (for memory backend) */
  memory?: {
    /** Maximum number of entries (LRU eviction when exceeded) */
    maxEntries?: number;
    /** Cleanup interval in milliseconds */
    cleanupIntervalMs?: number;
  };
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** When the entry expires (timestamp in ms) */
  expiresAt: number;
  /** When the entry was created (timestamp in ms) */
  createdAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache operations (get + set + delete) */
  operations: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Number of entries currently in cache */
  size: number;
  /** Number of evictions (LRU or expired) */
  evictions?: number;
}

/**
 * Core cache interface implemented by all backends
 */
export interface ICache {
  /**
   * Get a value from the cache
   * @param key - Cache key
   * @returns The cached value or null if not found/expired
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Set a value in the cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time-to-live in seconds (optional, uses default if not provided)
   * @returns True if successfully set
   */
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<boolean>;

  /**
   * Delete a value from the cache
   * @param key - Cache key
   * @returns True if the key existed and was deleted
   */
  del(key: string): Promise<boolean>;

  /**
   * Check if a key exists in the cache
   * @param key - Cache key
   * @returns True if the key exists and hasn't expired
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get time-to-live for a key in seconds
   * @param key - Cache key
   * @returns Remaining TTL in seconds, or null if key doesn't exist
   */
  ttl(key: string): Promise<number | null>;

  /**
   * Clear all entries from the cache
   * @param pattern - Optional key pattern (e.g., "user:*") to selectively clear
   * @returns Number of keys deleted
   */
  clear(pattern?: string): Promise<number>;

  /**
   * Get cache statistics
   * @returns Cache statistics including hits, misses, size
   */
  stats(): Promise<CacheStats>;

  /**
   * Close the cache connection and cleanup resources
   */
  close(): Promise<void>;
}

/**
 * Cache-aside pattern helper options
 */
export interface CacheAsideOptions<T> {
  /** Cache key */
  key: string;
  /** Function to fetch data if cache miss */
  fetch: () => Promise<T>;
  /** Time-to-live in seconds (optional) */
  ttl?: number;
  /** Whether to refresh cache if expired (default: true) */
  refreshOnExpire?: boolean;
}

/**
 * Cache invalidation strategy
 */
export type InvalidationStrategy =
  | 'ttl'          // Time-based expiration
  | 'lru'          // Least recently used eviction
  | 'manual';      // Manual invalidation only

/**
 * Factory configuration for cache creation
 */
export interface CacheFactoryConfig extends CacheConfig {
  /** Invalidation strategy (optional, default: 'ttl') */
  invalidation?: InvalidationStrategy;
}
