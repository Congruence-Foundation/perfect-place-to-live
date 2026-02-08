/**
 * Heatmap tile cache — LRU-only (no Redis).
 * Heatmap computation is fast; no need for cross-instance persistence.
 */

import { createLRUCache, type CacheStats } from './two-level-cache';
import { HEATMAP_TILE_CONFIG } from '@/constants/performance';
import type { HeatmapPoint, POI } from '@/types';

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

const heatmapCache = createLRUCache<HeatmapTileCacheEntry>({
  name: 'Heatmap tile',
  maxSize: HEATMAP_TILE_CONFIG.SERVER_LRU_MAX,
  ttlSeconds: HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS,
});

export async function getCachedHeatmapTile(key: string): Promise<HeatmapTileCacheEntry | null> {
  return heatmapCache.get(key);
}

export async function setCachedHeatmapTile(key: string, data: HeatmapTileCacheEntry): Promise<void> {
  return heatmapCache.set(key, data);
}

export function getHeatmapTileCacheStats(): CacheStats {
  return heatmapCache.getStats();
}
