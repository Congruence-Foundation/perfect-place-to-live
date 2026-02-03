/**
 * Property tile cache with Redis-first strategy
 * 
 * Optimized for serverless environments where each request may run in a different instance.
 * 
 * Strategy:
 * 1. Redis (primary) - persistent, shared across all instances
 * 2. LRU cache (secondary) - request-local optimization to avoid repeated Redis calls
 */

import { LRUCache } from 'lru-cache';
import { cacheGet, cacheSet } from './cache';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';
import type { OtodomProperty, PropertyCluster } from '@/extensions/real-estate/types';

/**
 * Cached tile data structure
 */
export interface TileCacheEntry {
  properties: OtodomProperty[];
  clusters: PropertyCluster[];
  totalCount: number;
  fetchedAt: string;
}

/**
 * LRU cache for request-local optimization
 */
const tileCache = new LRUCache<string, TileCacheEntry>({
  max: PROPERTY_TILE_CONFIG.SERVER_LRU_MAX,
  ttl: PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS * 1000,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

// Track cache hits for stats
let l1Hits = 0;
let l2Hits = 0;
let misses = 0;

/**
 * Get a tile from cache (Redis-first)
 * 
 * @param key - Cache key for the tile
 * @returns Cached tile data or null if not found
 */
export async function getCachedTile(key: string): Promise<TileCacheEntry | null> {
  try {
    // Check L1 first (for same-request deduplication)
    const local = tileCache.get(key);
    if (local) {
      l1Hits++;
      return local;
    }

    // Check Redis (primary cache)
    const redis = await cacheGet<TileCacheEntry>(key);
    if (redis) {
      l2Hits++;
      // Populate L1 for subsequent reads in same request
      tileCache.set(key, redis);
      return redis;
    }

    misses++;
    return null;
  } catch (error) {
    console.error('Tile cache get error:', error);
    return null;
  }
}

/**
 * Store a tile in cache (Redis-first)
 * 
 * @param key - Cache key for the tile
 * @param data - Tile data to cache
 */
export async function setCachedTile(key: string, data: TileCacheEntry): Promise<void> {
  try {
    // Write to Redis first (primary, persistent)
    await cacheSet(key, data, PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS);
    
    // Then populate L1 for same-request reads
    tileCache.set(key, data);
  } catch (error) {
    console.error('Tile cache set error:', error);
    // Still try to set L1 even if Redis fails
    tileCache.set(key, data);
  }
}

/**
 * Check if a tile exists in cache
 * Checks L1 first, then Redis (populates L1 if found in Redis)
 * 
 * @param key - Cache key for the tile
 * @returns True if tile exists in cache
 */
export async function hasCachedTile(key: string): Promise<boolean> {
  if (tileCache.has(key)) {
    return true;
  }
  const redis = await cacheGet<TileCacheEntry>(key);
  if (redis) {
    // Populate L1 for subsequent reads
    tileCache.set(key, redis);
    return true;
  }
  return false;
}

/**
 * Remove a tile from L1 cache
 * Note: Does not remove from Redis (TTL handles expiration)
 * 
 * @param key - Cache key for the tile
 */
export function deleteCachedTile(key: string): void {
  tileCache.delete(key);
}

/**
 * Clear L1 tile cache
 * Note: Does not clear Redis cache
 */
export function clearTileCache(): void {
  tileCache.clear();
}

/**
 * Get cache statistics
 * Useful for debugging and monitoring
 */
export function getTileCacheStats(): {
  size: number;
  max: number;
  l1Hits: number;
  l2Hits: number;
  misses: number;
} {
  return {
    size: tileCache.size,
    max: PROPERTY_TILE_CONFIG.SERVER_LRU_MAX,
    l1Hits,
    l2Hits,
    misses,
  };
}

/**
 * Generate a cache key for a property tile
 * Includes tile coordinates and filter hash
 * 
 * @param z - Zoom level
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param filterHash - Hash of the property filters
 * @returns Cache key string
 */
export function generateTileCacheKey(
  z: number,
  x: number,
  y: number,
  filterHash: string
): string {
  return `prop-tile:${z}:${x}:${y}:${filterHash}`;
}
