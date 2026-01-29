import { Redis } from '@upstash/redis';

// In-memory cache for development/fallback
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_TTL = 3600; // 1 hour in seconds

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

    // Fallback to memory cache
    memoryCache.set(key, {
      data: value,
      expiresAt: Date.now() + ttl * 1000,
    });
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

/**
 * Delete a value from cache
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    const client = getRedis();
    if (client) {
      await client.del(key);
      return;
    }

    memoryCache.delete(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

/**
 * Get multiple values from cache
 */
export async function cacheGetMany<T>(keys: string[]): Promise<(T | null)[]> {
  try {
    const client = getRedis();
    if (client) {
      return await client.mget<T[]>(...keys);
    }

    // Fallback to memory cache
    return keys.map((key) => {
      const cached = memoryCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
      }
      return null;
    });
  } catch (error) {
    console.error('Cache get many error:', error);
    return keys.map(() => null);
  }
}

/**
 * Clear all cache entries (memory cache only)
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
}

/**
 * Get cache stats (memory cache only)
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: memoryCache.size,
    keys: Array.from(memoryCache.keys()),
  };
}
