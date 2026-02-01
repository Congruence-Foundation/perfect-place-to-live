/**
 * Property tile cache with LRU + Redis support
 * 
 * Uses a two-layer caching strategy:
 * 1. LRU cache (in-memory) - fastest, limited size
 * 2. Redis cache (optional) - persistent, shared across instances
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
 * LRU cache for property tiles
 * Provides fast in-memory caching with automatic eviction
 */
const tileCache = new LRUCache<string, TileCacheEntry>({
  max: PROPERTY_TILE_CONFIG.SERVER_LRU_MAX,
  ttl: PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS * 1000,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

/**
 * Get a tile from cache
 * Checks LRU cache first, then Redis
 * 
 * @param key - Cache key for the tile
 * @returns Cached tile data or null if not found
 */
export async function getCachedTile(key: string): Promise<TileCacheEntry | null> {
  try {
    // Check LRU cache first (fastest)
    const local = tileCache.get(key);
    if (local) {
      return local;
    }

    // Check Redis (slower but persistent)
    const redis = await cacheGet<TileCacheEntry>(key);
    if (redis) {
      // Populate LRU cache for subsequent requests
      tileCache.set(key, redis);
      return redis;
    }

    return null;
  } catch (error) {
    console.error('Tile cache get error:', error);
    return null;
  }
}

/**
 * Store a tile in cache
 * Writes to both LRU cache and Redis
 * 
 * @param key - Cache key for the tile
 * @param data - Tile data to cache
 */
export async function setCachedTile(key: string, data: TileCacheEntry): Promise<void> {
  try {
    // Store in LRU cache
    tileCache.set(key, data);

    // Store in Redis (async, don't wait)
    cacheSet(key, data, PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS).catch(err => {
      console.error('Redis tile cache set error:', err);
    });
  } catch (error) {
    console.error('Tile cache set error:', error);
  }
}

/**
 * Check if a tile exists in cache (without retrieving it)
 * Only checks LRU cache for performance
 * 
 * @param key - Cache key for the tile
 * @returns True if tile exists in LRU cache
 */
export function hasCachedTile(key: string): boolean {
  return tileCache.has(key);
}

/**
 * Remove a tile from cache
 * 
 * @param key - Cache key for the tile
 */
export function deleteCachedTile(key: string): void {
  tileCache.delete(key);
}

/**
 * Clear all tiles from LRU cache
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
  hitRate: number;
} {
  const calculatedSize = tileCache.calculatedSize || tileCache.size;
  
  return {
    size: tileCache.size,
    max: PROPERTY_TILE_CONFIG.SERVER_LRU_MAX,
    hitRate: calculatedSize > 0 ? 1 - (tileCache.size / calculatedSize) : 0,
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
