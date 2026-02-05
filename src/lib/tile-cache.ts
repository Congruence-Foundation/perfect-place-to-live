/**
 * Property tile cache with Redis-first strategy
 * 
 * Uses the generic two-level cache factory for Redis + LRU caching.
 */

import { createTwoLevelCache, type CacheStats } from './two-level-cache';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';
import type { UnifiedProperty, UnifiedCluster } from '@/extensions/real-estate/lib/shared';

/**
 * Cached tile data structure
 * Now uses unified property and cluster types for multi-source support.
 */
export interface TileCacheEntry {
  properties: UnifiedProperty[];
  clusters: UnifiedCluster[];
  totalCount: number;
  fetchedAt: string;
}

// Create the two-level cache instance
const propertyCache = createTwoLevelCache<TileCacheEntry>({
  name: 'Property tile',
  maxSize: PROPERTY_TILE_CONFIG.SERVER_LRU_MAX,
  ttlSeconds: PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS,
});

/**
 * Get a tile from cache
 */
export async function getCachedTile(key: string): Promise<TileCacheEntry | null> {
  return propertyCache.get(key);
}

/**
 * Store a tile in cache
 */
export async function setCachedTile(key: string, data: TileCacheEntry): Promise<void> {
  return propertyCache.set(key, data);
}

/**
 * Get cache statistics
 */
export function getTileCacheStats(): CacheStats {
  return propertyCache.getStats();
}

/**
 * Generate a cache key for a property tile
 */
export function generateTileCacheKey(
  z: number,
  x: number,
  y: number,
  filterHash: string
): string {
  return `prop-tile:${z}:${x}:${y}:${filterHash}`;
}
