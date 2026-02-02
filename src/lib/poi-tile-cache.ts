/**
 * POI Tile Cache System
 * 
 * Provides tile-aligned POI caching for efficient heatmap calculations.
 * Uses a two-layer caching strategy:
 * 1. LRU cache (in-memory) - fastest, limited size
 * 2. Redis cache (optional) - persistent, shared across instances
 * 
 * Key optimization: Fetches all uncached tiles in a single batched query
 * instead of making individual requests per tile.
 */

import { LRUCache } from 'lru-cache';
import type { POI, Bounds } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getPoiTileKey } from '@/lib/geo/tiles';
import { fetchPOIsBatched, type DataSource } from '@/lib/poi';
import { cacheGet, cacheSet } from '@/lib/cache';
import { POI_TILE_CONFIG } from '@/constants/performance';
import { createTimer } from '@/lib/profiling';

// ============================================================================
// Types
// ============================================================================

/**
 * Factor definition for POI fetching
 */
interface FactorDef {
  id: string;
  osmTags: string[];
}

/**
 * Cache check result for a single tile+factor combination
 */
interface CacheCheckResult {
  tile: TileCoord;
  factor: FactorDef;
  cacheKey: string;
  pois: POI[] | null; // null if not cached
}

// ============================================================================
// LRU Cache
// ============================================================================

/**
 * In-memory LRU cache for POI tiles
 * Key format: poi-tile:{z}:{x}:{y}:{factorId}
 */
const poiTileLRU = new LRUCache<string, POI[]>({
  max: POI_TILE_CONFIG.SERVER_LRU_MAX,
  ttl: POI_TILE_CONFIG.SERVER_TTL_SECONDS * 1000,
});

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Check LRU cache for a tile+factor combination
 */
function checkLRUCache(cacheKey: string): POI[] | undefined {
  return poiTileLRU.get(cacheKey);
}

/**
 * Check Redis cache for a tile+factor combination
 */
async function checkRedisCache(cacheKey: string): Promise<POI[] | null> {
  const cached = await cacheGet<POI[]>(cacheKey);
  if (cached) {
    // Populate LRU cache for subsequent requests
    poiTileLRU.set(cacheKey, cached);
  }
  return cached;
}

/**
 * Store POIs in both LRU and Redis cache
 */
function cachePOIs(cacheKey: string, pois: POI[]): void {
  poiTileLRU.set(cacheKey, pois);
  // Fire-and-forget Redis cache set
  cacheSet(cacheKey, pois, POI_TILE_CONFIG.SERVER_TTL_SECONDS).catch(() => {});
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get POIs for multiple tiles and factors with efficient batched fetching.
 * 
 * Algorithm:
 * 1. Check LRU cache for all tile+factor combinations (parallel)
 * 2. Check Redis cache for LRU misses (parallel)
 * 3. Batch fetch all remaining uncached combinations in a single query
 * 4. Populate caches with fetched data
 * 5. Merge and deduplicate results
 * 
 * @param tiles - Array of tile coordinates
 * @param factors - Array of factor definitions
 * @param dataSource - Data source to use ('neon' or 'overpass')
 * @returns Map of factor ID to deduplicated POI array
 */
export async function getPoiTilesForArea(
  tiles: TileCoord[],
  factors: FactorDef[],
  dataSource: DataSource
): Promise<Map<string, POI[]>> {
  const stopTotalTimer = createTimer('poi-cache:total');
  
  // Initialize result map
  const result = new Map<string, POI[]>();
  for (const factor of factors) {
    result.set(factor.id, []);
  }
  
  if (tiles.length === 0 || factors.length === 0) {
    stopTotalTimer({ tiles: 0, factors: 0, allCached: true });
    return result;
  }

  // Step 1: Check LRU cache for all combinations
  const stopLRUTimer = createTimer('poi-cache:lru-check');
  const { cached: lruCached, uncached: lruMisses } = checkAllLRUCache(tiles, factors);
  stopLRUTimer({ 
    total: tiles.length * factors.length, 
    hits: lruCached.length, 
    misses: lruMisses.length 
  });

  // Add LRU cached POIs to result
  for (const item of lruCached) {
    if (item.pois) {
      const existing = result.get(item.factor.id) || [];
      result.set(item.factor.id, [...existing, ...item.pois]);
    }
  }

  // Step 2: Check Redis cache for LRU misses (parallel)
  if (lruMisses.length > 0) {
    const stopRedisTimer = createTimer('poi-cache:redis-check');
    const { cached: redisCached, uncached: stillUncached } = await checkAllRedisCache(lruMisses);
    stopRedisTimer({ 
      checked: lruMisses.length, 
      hits: redisCached.length, 
      misses: stillUncached.length 
    });

    // Add Redis cached POIs to result
    for (const item of redisCached) {
      if (item.pois) {
        const existing = result.get(item.factor.id) || [];
        result.set(item.factor.id, [...existing, ...item.pois]);
      }
    }

    // Step 3: Batch fetch all remaining uncached tiles
    if (stillUncached.length > 0) {
      const stopFetchTimer = createTimer('poi-cache:batch-fetch');
      await fetchAndCacheUncached(stillUncached, dataSource, result);
      stopFetchTimer({ 
        combinations: stillUncached.length,
        dataSource 
      });
    }
  }

  // Step 4: Deduplicate results
  const stopDedupTimer = createTimer('poi-cache:dedup');
  const dedupedResult = deduplicateResults(result);
  stopDedupTimer({ factors: factors.length });

  stopTotalTimer({ 
    tiles: tiles.length, 
    factors: factors.length, 
    allCached: lruMisses.length === 0 
  });
  
  return dedupedResult;
}

// ============================================================================
// Cache Checking Helpers
// ============================================================================

/**
 * Check LRU cache for all tile+factor combinations
 */
function checkAllLRUCache(
  tiles: TileCoord[],
  factors: FactorDef[]
): { cached: CacheCheckResult[]; uncached: CacheCheckResult[] } {
  const cached: CacheCheckResult[] = [];
  const uncached: CacheCheckResult[] = [];

  for (const tile of tiles) {
    for (const factor of factors) {
      const cacheKey = getPoiTileKey(tile.z, tile.x, tile.y, factor.id);
      const pois = checkLRUCache(cacheKey);
      
      const item: CacheCheckResult = { tile, factor, cacheKey, pois: pois ?? null };
      
      if (pois !== undefined) {
        cached.push(item);
      } else {
        uncached.push(item);
      }
    }
  }

  return { cached, uncached };
}

/**
 * Check Redis cache for all uncached combinations (parallel)
 */
async function checkAllRedisCache(
  items: CacheCheckResult[]
): Promise<{ cached: CacheCheckResult[]; uncached: CacheCheckResult[] }> {
  // Parallel Redis lookups
  const results = await Promise.all(
    items.map(async (item) => {
      const pois = await checkRedisCache(item.cacheKey);
      return { ...item, pois };
    })
  );

  const cached = results.filter(r => r.pois !== null);
  const uncached = results.filter(r => r.pois === null);

  return { cached, uncached };
}

// ============================================================================
// Batch Fetching
// ============================================================================

/**
 * Fetch all uncached tile+factor combinations in a single batched query
 * and populate the caches
 */
async function fetchAndCacheUncached(
  uncached: CacheCheckResult[],
  dataSource: DataSource,
  result: Map<string, POI[]>
): Promise<void> {
  // Group uncached items by tile to determine unique tiles needed
  const uniqueTiles = getUniqueTiles(uncached);
  const uniqueFactors = getUniqueFactors(uncached);

  // Single batched fetch for all tiles and factors
  const fetchedData = await fetchPOIsBatched(uniqueTiles, uniqueFactors, dataSource);

  // Populate caches and add to result
  for (const item of uncached) {
    const tileKey = `${item.tile.z}:${item.tile.x}:${item.tile.y}`;
    const tileData = fetchedData.get(tileKey);
    const pois = tileData?.[item.factor.id] || [];

    // Cache the result
    cachePOIs(item.cacheKey, pois);

    // Add to result
    const existing = result.get(item.factor.id) || [];
    result.set(item.factor.id, [...existing, ...pois]);
  }
}

/**
 * Extract unique tiles from cache check results
 */
function getUniqueTiles(items: CacheCheckResult[]): TileCoord[] {
  const seen = new Set<string>();
  const tiles: TileCoord[] = [];

  for (const item of items) {
    const key = `${item.tile.z}:${item.tile.x}:${item.tile.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      tiles.push(item.tile);
    }
  }

  return tiles;
}

/**
 * Extract unique factors from cache check results
 */
function getUniqueFactors(items: CacheCheckResult[]): FactorDef[] {
  const seen = new Set<string>();
  const factors: FactorDef[] = [];

  for (const item of items) {
    if (!seen.has(item.factor.id)) {
      seen.add(item.factor.id);
      factors.push(item.factor);
    }
  }

  return factors;
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplicate POIs by location for each factor
 * POIs from overlapping tiles may appear multiple times
 */
function deduplicateResults(result: Map<string, POI[]>): Map<string, POI[]> {
  for (const [factorId, pois] of result) {
    const seen = new Set<string>();
    const unique = pois.filter(poi => {
      // Use 6 decimal places (~0.1m precision)
      const key = `${poi.lat.toFixed(6)}:${poi.lng.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    result.set(factorId, unique);
  }
  return result;
}

// ============================================================================
// Viewport Filtering
// ============================================================================

/**
 * Filter POIs to viewport bounds with optional buffer
 * 
 * @param poiData - Map of factor ID to POI array
 * @param bounds - Viewport bounds
 * @param buffer - Buffer in degrees (default ~100m)
 * @returns Filtered POI record
 */
export function filterPoisToViewport(
  poiData: Map<string, POI[]>,
  bounds: Bounds,
  buffer: number = 0.001
): Record<string, POI[]> {
  const result: Record<string, POI[]> = {};
  
  const expandedBounds = {
    south: bounds.south - buffer,
    north: bounds.north + buffer,
    west: bounds.west - buffer,
    east: bounds.east + buffer,
  };

  for (const [factorId, pois] of poiData) {
    result[factorId] = pois.filter(poi =>
      poi.lat >= expandedBounds.south &&
      poi.lat <= expandedBounds.north &&
      poi.lng >= expandedBounds.west &&
      poi.lng <= expandedBounds.east
    );
  }

  return result;
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear the POI tile cache (useful for testing)
 */
export function clearPoiTileCache(): void {
  poiTileLRU.clear();
}

/**
 * Get cache statistics
 */
export function getPoiTileCacheStats(): { size: number; max: number } {
  return {
    size: poiTileLRU.size,
    max: POI_TILE_CONFIG.SERVER_LRU_MAX,
  };
}
