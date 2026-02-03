import { Redis } from '@upstash/redis';

// In-memory cache for development/fallback
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_TTL = 3600; // 1 hour in seconds
const MEMORY_CACHE_MAX_SIZE = 10000; // Prevent unbounded growth

// Lazy-initialize Redis client
let redis: Redis | null = null;

/**
 * Check if Upstash Redis is available
 */
function isRedisAvailable(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Get Redis client (lazy initialization)
 */
function getRedis(): Redis | null {
  if (!isRedisAvailable()) return null;
  
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  
  return redis;
}

/**
 * Get a value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis();
    if (client) {
      return await client.get<T>(key);
    }

    // Fallback to memory cache
    const cached = memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    // Clean up expired entry
    if (cached) {
      memoryCache.delete(key);
    }

    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Set a value in cache
 */
export async function cacheSet<T>(key: string, value: T, ttl: number = DEFAULT_TTL): Promise<void> {
  try {
    const client = getRedis();
    if (client) {
      await client.set(key, value, { ex: ttl });
      return;
    }

    // Fallback to memory cache with size limit
    if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE) {
      // Simple eviction: remove oldest entries (first 10%)
      const keysToDelete = Array.from(memoryCache.keys()).slice(0, Math.floor(MEMORY_CACHE_MAX_SIZE * 0.1));
      for (const k of keysToDelete) {
        memoryCache.delete(k);
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

/**
 * Cache status information for debugging
 */
export interface CacheStatus {
  type: 'redis' | 'memory';
  available: boolean;
  url?: string;
  memoryCacheSize: number;
}

/**
 * Get cache status for debugging and monitoring
 * Useful for verifying Redis connection locally or in production
 */
export function getCacheStatus(): CacheStatus {
  const available = isRedisAvailable();
  return {
    type: available ? 'redis' : 'memory',
    available,
    // Upstash REST URLs don't contain credentials, safe to expose
    url: available ? process.env.UPSTASH_REDIS_REST_URL : undefined,
    memoryCacheSize: memoryCache.size,
  };
}

/**
 * Test Redis connection by performing a ping
 * Returns latency in milliseconds or null if unavailable/failed
 */
export async function testCacheConnection(): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const client = getRedis();
  if (!client) {
    return { success: false, error: 'Redis not configured' };
  }

  try {
    const start = Date.now();
    await client.ping();
    const latencyMs = Date.now() - start;
    return { success: true, latencyMs };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get Redis database stats (key count)
 */
export async function getRedisStats(): Promise<{ keyCount: number } | null> {
  const client = getRedis();
  if (!client) {
    return null;
  }

  try {
    const keyCount = await client.dbsize();
    return { keyCount };
  } catch (error) {
    console.error('Redis stats error:', error);
    return null;
  }
}
