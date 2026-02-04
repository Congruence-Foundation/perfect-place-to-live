/**
 * Generic Two-Level Cache Factory
 * 
 * Provides two cache strategies:
 * 1. createTwoLevelCache - Redis-first with LRU fallback (for slow operations like POI/Property fetches)
 * 2. createLRUCache - LRU only, no Redis (for fast operations like heatmap computation)
 */

import { LRUCache } from 'lru-cache';
import { cacheGet, cacheSet } from './cache';

/**
 * Cache statistics for debugging and monitoring
 */
export interface CacheStats {
  size: number;
  max: number;
  l1Hits: number;
  l2Hits: number;
  misses: number;
}

/**
 * Configuration for creating a cache
 */
export interface CacheConfig {
  /** Name for error logging */
  name: string;
  /** Maximum entries in LRU cache */
  maxSize: number;
  /** TTL in seconds */
  ttlSeconds: number;
}

/**
 * Cache instance interface
 */
export interface TwoLevelCache<T> {
  /** Get a value from cache */
  get: (key: string) => Promise<T | null>;
  /** Set a value in cache */
  set: (key: string, data: T) => Promise<void>;
  /** Get cache statistics */
  getStats: () => CacheStats;
}

/**
 * Creates a two-level cache with Redis as primary and LRU as secondary.
 * Use for slow operations (POI fetches, Property fetches) where persistence matters.
 * Includes request coalescing to prevent cache stampede.
 * 
 * @param config - Cache configuration
 * @returns Cache instance with get, set, and getStats methods
 */
export function createTwoLevelCache<T extends object>(config: CacheConfig): TwoLevelCache<T> {
  const { name, maxSize, ttlSeconds } = config;

  const lruCache = new LRUCache<string, T>({
    max: maxSize,
    ttl: ttlSeconds * 1000,
    updateAgeOnGet: true,
    updateAgeOnHas: true,
  });

  // Track pending requests to prevent cache stampede
  const pendingRequests = new Map<string, Promise<T | null>>();

  let l1Hits = 0;
  let l2Hits = 0;
  let misses = 0;

  async function doGet(key: string): Promise<T | null> {
    try {
      // Check L1 first
      const local = lruCache.get(key);
      if (local !== undefined) {
        l1Hits++;
        return local;
      }

      // Check Redis (primary cache)
      const redis = await cacheGet<T>(key);
      if (redis) {
        l2Hits++;
        lruCache.set(key, redis);
        return redis;
      }

      misses++;
      return null;
    } catch (error) {
      console.error(`${name} cache get error:`, error);
      return null;
    }
  }

  return {
    async get(key: string): Promise<T | null> {
      // Check if there's already a pending request for this key (request coalescing)
      const pending = pendingRequests.get(key);
      if (pending) {
        return pending;
      }

      // Create new request and track it
      const promise = doGet(key);
      pendingRequests.set(key, promise);

      try {
        return await promise;
      } finally {
        pendingRequests.delete(key);
      }
    },

    async set(key: string, data: T): Promise<void> {
      try {
        await cacheSet(key, data, ttlSeconds);
        lruCache.set(key, data);
      } catch (error) {
        console.error(`${name} cache set error:`, error);
        lruCache.set(key, data);
      }
    },

    getStats(): CacheStats {
      return {
        size: lruCache.size,
        max: maxSize,
        l1Hits,
        l2Hits,
        misses,
      };
    },
  };
}

/**
 * Creates an LRU-only cache (no Redis).
 * Use for fast operations (heatmap computation) where in-memory caching is sufficient.
 * 
 * @param config - Cache configuration
 * @returns Cache instance with get, set, and getStats methods
 */
export function createLRUCache<T extends object>(config: CacheConfig): TwoLevelCache<T> {
  const { maxSize, ttlSeconds } = config;

  const lruCache = new LRUCache<string, T>({
    max: maxSize,
    ttl: ttlSeconds * 1000,
    updateAgeOnGet: true,
    updateAgeOnHas: true,
  });

  let l1Hits = 0;
  let misses = 0;

  return {
    async get(key: string): Promise<T | null> {
      const local = lruCache.get(key);
      if (local !== undefined) {
        l1Hits++;
        return local;
      }
      misses++;
      return null;
    },

    async set(key: string, data: T): Promise<void> {
      lruCache.set(key, data);
    },

    getStats(): CacheStats {
      return {
        size: lruCache.size,
        max: maxSize,
        l1Hits,
        l2Hits: 0, // No L2 for LRU-only cache
        misses,
      };
    },
  };
}
