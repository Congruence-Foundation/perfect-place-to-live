/**
 * POI Tile Cache System (Redis-first)
 * 
 * Optimized for serverless environments where each request may run in a different instance.
 * 
 * Strategy:
 * 1. Redis (primary) - persistent, shared across all instances
 * 2. LRU cache (secondary) - request-local optimization to avoid repeated Redis calls
 *    within the same request batch
 * 
 * Key optimization: Fetches all uncached tiles in a single batched query
 * instead of making individual requests per tile.
 */

import type { POI, Bounds, FactorDef } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getPoiTileKey } from '@/lib/geo/tiles';
import { filterPoisToBounds } from '@/lib/geo/bounds';
import { fetchPOIsBatched, type POIDataSource } from '@/lib/poi';
import { createTwoLevelCache, type CacheStats } from './two-level-cache';
import { POI_TILE_CONFIG, COORDINATE_CONFIG } from '@/constants/performance';
import { createTimer } from '@/lib/profiling';

// ============================================================================
// Types
// ============================================================================

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
// Cache Instance
// ============================================================================

/**
 * Two-level cache for POI tiles (Redis + LRU)
 * Key format: poi-tile:{z}:{x}:{y}:{factorId}
 */
const poiTileCache = createTwoLevelCache<POI[]>({
  name: 'POI tile',
  maxSize: POI_TILE_CONFIG.SERVER_LRU_MAX,
  ttlSeconds: POI_TILE_CONFIG.SERVER_TTL_SECONDS,
});

// ============================================================================
// Main API
// ============================================================================

/**
 * Get POIs for multiple tiles and factors with efficient batched fetching.
 * 
 * Algorithm:
 * 1. Check cache for all tile+factor combinations (parallel)
 * 2. Batch fetch all remaining uncached combinations in a single query
 * 3. Populate caches with fetched data
 * 4. Merge and deduplicate results
 * 
 * @param tiles - Array of tile coordinates
 * @param factors - Array of factor definitions
 * @param dataSource - Data source to use ('neon' or 'overpass')
 * @returns Map of factor ID to deduplicated POI array
 */
export async function getPoiTilesForArea(
  tiles: TileCoord[],
  factors: FactorDef[],
  dataSource: POIDataSource
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

  // Step 1: Check cache for all combinations (parallel)
  const stopCacheTimer = createTimer('poi-cache:check');
  const { cached, uncached } = await checkAllCache(tiles, factors);
  stopCacheTimer({ 
    total: tiles.length * factors.length, 
    hits: cached.length, 
    misses: uncached.length 
  });

  // Add cached POIs to result
  for (const item of cached) {
    if (item.pois) {
      const existing = result.get(item.factor.id);
      if (existing) {
        existing.push(...item.pois);
      } else {
        result.set(item.factor.id, [...item.pois]);
      }
    }
  }

  // Step 2: Batch fetch all remaining uncached tiles
  if (uncached.length > 0) {
    const stopFetchTimer = createTimer('poi-cache:batch-fetch');
    await fetchAndCacheUncached(uncached, dataSource, result);
    stopFetchTimer({ 
      combinations: uncached.length,
      dataSource 
    });
  }

  // Step 3: Deduplicate results
  const stopDedupTimer = createTimer('poi-cache:dedup');
  const dedupedResult = deduplicateResults(result);
  stopDedupTimer({ factors: factors.length });

  stopTotalTimer({ 
    tiles: tiles.length, 
    factors: factors.length, 
    allCached: uncached.length === 0 
  });
  
  return dedupedResult;
}

// ============================================================================
// Cache Checking
// ============================================================================

/**
 * Check cache for all tile+factor combinations (parallel)
 */
async function checkAllCache(
  tiles: TileCoord[],
  factors: FactorDef[]
): Promise<{ cached: CacheCheckResult[]; uncached: CacheCheckResult[] }> {
  // Build all cache check items
  const items: Omit<CacheCheckResult, 'pois'>[] = [];
  for (const tile of tiles) {
    for (const factor of factors) {
      const cacheKey = getPoiTileKey(tile.z, tile.x, tile.y, factor.id);
      items.push({ tile, factor, cacheKey });
    }
  }

  // Parallel cache lookups
  const results = await Promise.all(
    items.map(async (item) => {
      const pois = await poiTileCache.get(item.cacheKey);
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
  dataSource: POIDataSource,
  result: Map<string, POI[]>
): Promise<void> {
  // Group uncached items by tile to determine unique tiles needed
  const uniqueTiles = getUniqueTiles(uncached);
  const uniqueFactors = getUniqueFactors(uncached);

  // Single batched fetch for all tiles and factors
  const fetchedData = await fetchPOIsBatched(uniqueTiles, uniqueFactors, dataSource);

  // Check if we got any POIs at all
  let totalPOIs = 0;
  for (const tileData of fetchedData.values()) {
    for (const pois of Object.values(tileData)) {
      totalPOIs += pois.length;
    }
  }
  
  // If no POIs were fetched, don't cache empty results
  // This allows future requests to retry fetching
  const shouldCache = totalPOIs > 0;
  if (!shouldCache) {
    console.log(`[POI-Cache] Skipping cache - no POIs fetched for ${uniqueTiles.length} tiles, ${uniqueFactors.length} factors`);
  }

  // Populate caches and add to result (parallel cache writes)
  const cachePromises: Promise<void>[] = [];
  for (const item of uncached) {
    const tileKey = `${item.tile.z}:${item.tile.x}:${item.tile.y}`;
    const tileData = fetchedData.get(tileKey);
    const pois = tileData?.[item.factor.id] || [];

    // Only cache if we got POIs (don't cache empty results)
    if (shouldCache) {
      cachePromises.push(poiTileCache.set(item.cacheKey, pois));
    }

    // Add to result
    const existing = result.get(item.factor.id);
    if (existing) {
      existing.push(...pois);
    } else {
      result.set(item.factor.id, [...pois]);
    }
  }
  
  // Wait for all cache writes to complete
  await Promise.all(cachePromises);
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
      // Use configured precision for deduplication
      const key = `${poi.lat.toFixed(COORDINATE_CONFIG.DEDUP_PRECISION)}:${poi.lng.toFixed(COORDINATE_CONFIG.DEDUP_PRECISION)}`;
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

/** Buffer for viewport filtering in degrees (~111m at equator, ~70m at 50° latitude) */
const DEFAULT_VIEWPORT_BUFFER = 0.001;

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
  buffer: number = DEFAULT_VIEWPORT_BUFFER
): Record<string, POI[]> {
  return filterPoisToBounds(poiData, bounds, buffer);
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Get cache statistics
 */
export function getPoiTileCacheStats(): CacheStats {
  return poiTileCache.getStats();
}
