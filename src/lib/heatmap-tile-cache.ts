/**
 * Heatmap tile cache with LRU + Redis support
 * 
 * Uses a two-layer caching strategy:
 * 1. LRU cache (in-memory) - fastest, limited size
 * 2. Redis cache (optional) - persistent, shared across instances
 * 
 * Separate from property tile cache to avoid eviction conflicts
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
 * LRU cache for heatmap tiles
 * Provides fast in-memory caching with automatic eviction
 * Uses fewer entries than property cache due to larger data size
 */
const heatmapTileCache = new LRUCache<string, HeatmapTileCacheEntry>({
  max: HEATMAP_TILE_CONFIG.SERVER_LRU_MAX,
  ttl: HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS * 1000,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

/**
 * Get a heatmap tile from cache
 * Checks LRU cache first, then Redis
 * 
 * @param key - Cache key for the tile
 * @returns Cached tile data or null if not found
 */
export async function getCachedHeatmapTile(key: string): Promise<HeatmapTileCacheEntry | null> {
  try {
    // Check LRU cache first (fastest)
    const local = heatmapTileCache.get(key);
    if (local) {
      return local;
    }

    // Check Redis (slower but persistent)
    const redis = await cacheGet<HeatmapTileCacheEntry>(key);
    if (redis) {
      // Populate LRU cache for subsequent requests
      heatmapTileCache.set(key, redis);
      return redis;
    }

    return null;
  } catch (error) {
    console.error('Heatmap tile cache get error:', error);
    return null;
  }
}

/**
 * Store a heatmap tile in cache
 * Writes to both LRU cache and Redis
 * 
 * @param key - Cache key for the tile
 * @param data - Tile data to cache
 */
export async function setCachedHeatmapTile(key: string, data: HeatmapTileCacheEntry): Promise<void> {
  try {
    // Store in LRU cache
    heatmapTileCache.set(key, data);

    // Store in Redis (async, don't wait)
    cacheSet(key, data, HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS).catch(err => {
      console.error('Redis heatmap tile cache set error:', err);
    });
  } catch (error) {
    console.error('Heatmap tile cache set error:', error);
  }
}

/**
 * Check if a heatmap tile exists in cache (without retrieving it)
 * Only checks LRU cache for performance
 * 
 * @param key - Cache key for the tile
 * @returns True if tile exists in LRU cache
 */
export function hasCachedHeatmapTile(key: string): boolean {
  return heatmapTileCache.has(key);
}

/**
 * Remove a heatmap tile from cache
 * 
 * @param key - Cache key for the tile
 */
export function deleteCachedHeatmapTile(key: string): void {
  heatmapTileCache.delete(key);
}

/**
 * Clear all heatmap tiles from LRU cache
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
  hitRate: number;
} {
  const calculatedSize = heatmapTileCache.calculatedSize || heatmapTileCache.size;
  
  return {
    size: heatmapTileCache.size,
    max: HEATMAP_TILE_CONFIG.SERVER_LRU_MAX,
    hitRate: calculatedSize > 0 ? 1 - (heatmapTileCache.size / calculatedSize) : 0,
  };
}
