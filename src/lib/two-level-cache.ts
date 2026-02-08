/**
 * Generic Two-Level Cache Factory
 *
 * - createTwoLevelCache: Redis-first with LRU fallback (for slow operations)
 * - createLRUCache: LRU only, no Redis (for fast operations)
 */

import { LRUCache } from 'lru-cache';
import { cacheGet, cacheSet } from './cache';

export interface CacheStats {
  size: number;
  max: number;
  l1Hits: number;
  l2Hits: number;
  misses: number;
}

interface CacheConfig {
  name: string;
  maxSize: number;
  ttlSeconds: number;
}

export interface TwoLevelCache<T> {
  get: (key: string) => Promise<T | null>;
  set: (key: string, data: T) => Promise<void>;
  getStats: () => CacheStats;
}

/**
 * Two-level cache: Redis (primary) + LRU (secondary).
 * Includes request coalescing to prevent cache stampede.
 */
export function createTwoLevelCache<T extends object>(config: CacheConfig): TwoLevelCache<T> {
  const { name, maxSize, ttlSeconds } = config;

  const lruCache = new LRUCache<string, T>({
    max: maxSize,
    ttl: ttlSeconds * 1000,
    updateAgeOnGet: true,
  });

  const pendingRequests = new Map<string, Promise<T | null>>();
  let l1Hits = 0;
  let l2Hits = 0;
  let misses = 0;

  async function doGet(key: string): Promise<T | null> {
    try {
      const local = lruCache.get(key);
      if (local !== undefined) {
        l1Hits++;
        return local;
      }

      const remote = await cacheGet<T>(key);
      if (remote) {
        l2Hits++;
        lruCache.set(key, remote);
        return remote;
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
      // Request coalescing — reuse in-flight lookups for the same key
      const pending = pendingRequests.get(key);
      if (pending) return pending;

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
      return { size: lruCache.size, max: maxSize, l1Hits, l2Hits, misses };
    },
  };
}

/** LRU-only cache (no Redis). For fast operations where in-memory caching suffices. */
export function createLRUCache<T extends object>(config: CacheConfig): TwoLevelCache<T> {
  const { maxSize, ttlSeconds } = config;

  const lruCache = new LRUCache<string, T>({
    max: maxSize,
    ttl: ttlSeconds * 1000,
    updateAgeOnGet: true,
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
      return { size: lruCache.size, max: maxSize, l1Hits, l2Hits: 0, misses };
    },
  };
}
