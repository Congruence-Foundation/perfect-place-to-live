/**
 * Property tile cache — Redis-first with LRU fallback.
 */

import { createTwoLevelCache, type CacheStats } from './two-level-cache';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';
import type { UnifiedProperty, UnifiedCluster } from '@/extensions/real-estate/lib/shared';

export interface TileCacheEntry {
  properties: UnifiedProperty[];
  clusters: UnifiedCluster[];
  totalCount: number;
  fetchedAt: string;
}

const propertyCache = createTwoLevelCache<TileCacheEntry>({
  name: 'Property tile',
  maxSize: PROPERTY_TILE_CONFIG.SERVER_LRU_MAX,
  ttlSeconds: PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS,
});

export async function getCachedTile(key: string): Promise<TileCacheEntry | null> {
  return propertyCache.get(key);
}

export async function setCachedTile(key: string, data: TileCacheEntry): Promise<void> {
  return propertyCache.set(key, data);
}

export function getTileCacheStats(): CacheStats {
  return propertyCache.getStats();
}

export function generateTileCacheKey(
  z: number,
  x: number,
  y: number,
  filterHash: string
): string {
  return `prop-tile:${z}:${x}:${y}:${filterHash}`;
}
