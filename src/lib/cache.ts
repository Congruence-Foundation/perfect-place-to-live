import { Redis } from '@upstash/redis';
import { CACHE_CONFIG } from '@/constants/performance';

// In-memory cache for development/fallback
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

// Lazy-initialize Redis client with singleton pattern
let redis: Redis | null = null;
let redisInitPromise: Promise<Redis | null> | null = null;

function isRedisAvailable(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Get Redis client (lazy initialization with race-condition protection).
 * Uses promise-based synchronization to ensure only one initialization occurs.
 */
async function getRedisAsync(): Promise<Redis | null> {
  if (!isRedisAvailable()) return null;
  if (redis) return redis;
  if (redisInitPromise) return redisInitPromise;
  
  redisInitPromise = (async () => {
    try {
      if (!redis) {
        redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
      }
      return redis;
    } catch (error) {
      console.error('Redis initialization error:', error);
      redisInitPromise = null; // Allow retry on failure
      return null;
    }
  })();
  
  return redisInitPromise;
}

/** Get a value from cache (Redis with in-memory fallback) */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = await getRedisAsync();
    if (client) {
      return await client.get<T>(key);
    }

    // Fallback to memory cache
    const cached = memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    if (cached) {
      memoryCache.delete(key);
    }

    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/** Set a value in cache with TTL (Redis with in-memory fallback) */
export async function cacheSet<T>(key: string, value: T, ttl: number = CACHE_CONFIG.DEFAULT_TTL_SECONDS): Promise<void> {
  try {
    const client = await getRedisAsync();
    if (client) {
      await client.set(key, value, { ex: ttl });
      return;
    }

    // Fallback to memory cache with size limit
    if (memoryCache.size >= CACHE_CONFIG.MEMORY_CACHE_MAX_SIZE) {
      // Evict expired entries first
      const now = Date.now();
      for (const [k, v] of memoryCache) {
        if (v.expiresAt <= now) {
          memoryCache.delete(k);
        }
      }
      
      // If still over limit, remove oldest entries by insertion order
      if (memoryCache.size >= CACHE_CONFIG.MEMORY_CACHE_MAX_SIZE) {
        const keysToDelete = Array.from(memoryCache.keys()).slice(
          0, 
          Math.floor(CACHE_CONFIG.MEMORY_CACHE_MAX_SIZE * CACHE_CONFIG.EVICTION_RATIO)
        );
        for (const k of keysToDelete) {
          memoryCache.delete(k);
        }
      }
    }
    
    memoryCache.set(key, {
      data: value,
      expiresAt: Date.now() + ttl * 1000,
    });
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export interface CacheStatus {
  type: 'redis' | 'memory';
  available: boolean;
  url?: string;
  memoryCacheSize: number;
}

/** Get cache status for debugging and monitoring */
export function getCacheStatus(): CacheStatus {
  const available = isRedisAvailable();
  return {
    type: available ? 'redis' : 'memory',
    available,
    url: available ? process.env.UPSTASH_REDIS_REST_URL : undefined,
    memoryCacheSize: memoryCache.size,
  };
}

/** Test Redis connection by performing a ping. Returns latency in ms or error. */
export async function testCacheConnection(): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const client = await getRedisAsync();
  if (!client) {
    return { success: false, error: 'Redis not configured' };
  }

  try {
    const start = Date.now();
    await client.ping();
    return { success: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/** Get Redis database stats (key count). Returns null if Redis is unavailable. */
export async function getRedisStats(): Promise<{ keyCount: number } | null> {
  const client = await getRedisAsync();
  if (!client) return null;

  try {
    const keyCount = await client.dbsize();
    return { keyCount };
  } catch (error) {
    console.error('Redis stats error:', error);
    return null;
  }
}
