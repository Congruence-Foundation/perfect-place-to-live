/**
 * Heatmap tile cache with Redis-first strategy
 * 
 * Optimized for serverless environments where each request may run in a different instance.
 * 
 * Strategy:
 * 1. Redis (primary) - persistent, shared across all instances
 * 2. LRU cache (secondary) - request-local optimization to avoid repeated Redis calls
 *    within the same request batch
 * 
 * On GET: Check L1 first (for same-request deduplication), then Redis
 * On SET: Write to Redis first (primary), then L1 (for same-request reads)
 */

import { LRUCache } from 'lru-cache';
import { cacheGet, cacheSet } from './cache';
import { HEATMAP_TILE_CONFIG } from '@/constants/performance';
import type { HeatmapPoint, POI } from '@/types';

/**
 * Cached heatmap tile data structure
 */
export interface HeatmapTileCacheEntry {
  points: HeatmapPoint[];
  pois: Record<string, POI[]>;
  metadata: {
    gridSize: number;
    pointCount: number;
    computeTimeMs: number;
    factorCount: number;
    poiCounts: Record<string, number>;
    dataSource?: string;
  };
  fetchedAt: string;
}

/**
 * LRU cache for request-local optimization
 * Smaller size since it's only for within-request deduplication
 */
const heatmapTileCache = new LRUCache<string, HeatmapTileCacheEntry>({
  max: HEATMAP_TILE_CONFIG.SERVER_LRU_MAX,
  ttl: HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS * 1000,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

// Track cache hits for stats
let l1Hits = 0;
let l2Hits = 0;
let misses = 0;

/**
 * Get a heatmap tile from cache (Redis-first)
 * 
 * @param key - Cache key for the tile
 * @returns Cached tile data or null if not found
 */
export async function getCachedHeatmapTile(key: string): Promise<HeatmapTileCacheEntry | null> {
  try {
    // Check L1 first (for same-request deduplication)
    const local = heatmapTileCache.get(key);
    if (local) {
      l1Hits++;
      return local;
    }

    // Check Redis (primary cache)
    const redis = await cacheGet<HeatmapTileCacheEntry>(key);
    if (redis) {
      l2Hits++;
      // Populate L1 for subsequent reads in same request
      heatmapTileCache.set(key, redis);
      return redis;
    }

    misses++;
    return null;
  } catch (error) {
    console.error('Heatmap tile cache get error:', error);
    return null;
  }
}

/**
 * Store a heatmap tile in cache (Redis-first)
 * 
 * @param key - Cache key for the tile
 * @param data - Tile data to cache
 */
export async function setCachedHeatmapTile(key: string, data: HeatmapTileCacheEntry): Promise<void> {
  try {
    // Write to Redis first (primary, persistent)
    await cacheSet(key, data, HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS);
    
    // Then populate L1 for same-request reads
    heatmapTileCache.set(key, data);
  } catch (error) {
    console.error('Heatmap tile cache set error:', error);
    // Still try to set L1 even if Redis fails
    heatmapTileCache.set(key, data);
  }
}

/**
 * Check if a heatmap tile exists in cache
 * Checks L1 first, then Redis (populates L1 if found in Redis)
 * 
 * @param key - Cache key for the tile
 * @returns True if tile exists in cache
 */
export async function hasCachedHeatmapTile(key: string): Promise<boolean> {
  if (heatmapTileCache.has(key)) {
    return true;
  }
  const redis = await cacheGet<HeatmapTileCacheEntry>(key);
  if (redis) {
    // Populate L1 for subsequent reads
    heatmapTileCache.set(key, redis);
    return true;
  }
  return false;
}

/**
 * Remove a heatmap tile from L1 cache
 * Note: Does not remove from Redis (TTL handles expiration)
 * 
 * @param key - Cache key for the tile
 */
export function deleteCachedHeatmapTile(key: string): void {
  heatmapTileCache.delete(key);
}

/**
 * Clear L1 heatmap tile cache
 * Note: Does not clear Redis cache
 */
export function clearHeatmapTileCache(): void {
  heatmapTileCache.clear();
}

/**
 * Get heatmap cache statistics
 * Useful for debugging and monitoring
 */
export function getHeatmapTileCacheStats(): {
  size: number;
  max: number;
  l1Hits: number;
  l2Hits: number;
  misses: number;
} {
  return {
    size: heatmapTileCache.size,
    max: HEATMAP_TILE_CONFIG.SERVER_LRU_MAX,
    l1Hits,
    l2Hits,
    misses,
  };
}
