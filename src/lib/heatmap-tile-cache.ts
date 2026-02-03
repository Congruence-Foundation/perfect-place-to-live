/**
 * Heatmap tile cache with LRU-only strategy
 * 
 * Uses in-memory LRU cache only (no Redis) since heatmap computation is fast
 * and doesn't need persistence across serverless instances.
 */

import { createLRUCache, type CacheStats } from './two-level-cache';
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

// Create the LRU-only cache instance (no Redis)
const heatmapCache = createLRUCache<HeatmapTileCacheEntry>({
  name: 'Heatmap tile',
  maxSize: HEATMAP_TILE_CONFIG.SERVER_LRU_MAX,
  ttlSeconds: HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS,
});

/**
 * Get a heatmap tile from cache
 */
export async function getCachedHeatmapTile(key: string): Promise<HeatmapTileCacheEntry | null> {
  return heatmapCache.get(key);
}

/**
 * Store a heatmap tile in cache
 */
export async function setCachedHeatmapTile(key: string, data: HeatmapTileCacheEntry): Promise<void> {
  return heatmapCache.set(key, data);
}

/**
 * Get heatmap cache statistics
 */
export function getHeatmapTileCacheStats(): CacheStats {
  return heatmapCache.getStats();
}
