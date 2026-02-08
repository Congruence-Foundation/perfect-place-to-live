/**
 * POI Tile Cache — Redis-first with LRU fallback.
 *
 * Fetches all uncached tiles in a single batched query
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

interface CacheCheckResult {
  tile: TileCoord;
  factor: FactorDef;
  cacheKey: string;
  pois: POI[] | null;
}

const poiTileCache = createTwoLevelCache<POI[]>({
  name: 'POI tile',
  maxSize: POI_TILE_CONFIG.SERVER_LRU_MAX,
  ttlSeconds: POI_TILE_CONFIG.SERVER_TTL_SECONDS,
});

/**
 * Get POIs for multiple tiles and factors with efficient batched fetching.
 *
 * 1. Check cache for all tile+factor combinations (parallel)
 * 2. Batch-fetch all uncached combinations
 * 3. Populate caches
 * 4. Merge and deduplicate results
 */
export async function getPoiTilesForArea(
  tiles: TileCoord[],
  factors: FactorDef[],
  dataSource: POIDataSource
): Promise<Map<string, POI[]>> {
  const stopTotalTimer = createTimer('poi-cache:total');
  
  const result = new Map<string, POI[]>();
  for (const factor of factors) {
    result.set(factor.id, []);
  }
  
  if (tiles.length === 0 || factors.length === 0) {
    stopTotalTimer({ tiles: 0, factors: 0, allCached: true });
    return result;
  }

  // Check cache for all combinations (parallel)
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
      appendToResult(result, item.factor.id, item.pois);
    }
  }

  // Batch-fetch uncached tiles
  if (uncached.length > 0) {
    const stopFetchTimer = createTimer('poi-cache:batch-fetch');
    await fetchAndCacheUncached(uncached, dataSource, result);
    stopFetchTimer({ combinations: uncached.length, dataSource });
  }

  // Deduplicate results (POIs from overlapping tiles may appear multiple times)
  const stopDedupTimer = createTimer('poi-cache:dedup');
  deduplicateResults(result);
  stopDedupTimer({ factors: factors.length });

  stopTotalTimer({ 
    tiles: tiles.length, 
    factors: factors.length, 
    allCached: uncached.length === 0 
  });
  
  return result;
}

/** Check cache for all tile+factor combinations in parallel */
async function checkAllCache(
  tiles: TileCoord[],
  factors: FactorDef[]
): Promise<{ cached: CacheCheckResult[]; uncached: CacheCheckResult[] }> {
  const items: Omit<CacheCheckResult, 'pois'>[] = [];
  for (const tile of tiles) {
    for (const factor of factors) {
      items.push({ tile, factor, cacheKey: getPoiTileKey(tile.z, tile.x, tile.y, factor.id) });
    }
  }

  const results = await Promise.all(
    items.map(async (item) => ({
      ...item,
      pois: await poiTileCache.get(item.cacheKey),
    }))
  );

  const cached = results.filter(r => r.pois !== null);
  const uncached = results.filter(r => r.pois === null);

  return { cached, uncached };
}

/** Fetch uncached tile+factor combinations in a single batch and populate caches */
async function fetchAndCacheUncached(
  uncached: CacheCheckResult[],
  dataSource: POIDataSource,
  result: Map<string, POI[]>
): Promise<void> {
  const uniqueTiles = deduplicateBy(uncached, item => tileKey(item.tile), item => item.tile);
  const uniqueFactors = deduplicateBy(uncached, item => item.factor.id, item => item.factor);

  const fetchedData = await fetchPOIsBatched(uniqueTiles, uniqueFactors, dataSource);

  // Count total POIs — skip caching empty results so future requests can retry
  let totalPOIs = 0;
  for (const tileData of fetchedData.values()) {
    for (const pois of Object.values(tileData)) {
      totalPOIs += pois.length;
    }
  }
  
  const shouldCache = totalPOIs > 0;
  if (!shouldCache) {
    console.log(`[POI-Cache] Skipping cache - no POIs fetched for ${uniqueTiles.length} tiles, ${uniqueFactors.length} factors`);
  }

  const cachePromises: Promise<void>[] = [];
  for (const item of uncached) {
    const tileData = fetchedData.get(tileKey(item.tile));
    const pois = tileData?.[item.factor.id] || [];

    if (shouldCache) {
      cachePromises.push(poiTileCache.set(item.cacheKey, pois));
    }

    appendToResult(result, item.factor.id, pois);
  }
  
  await Promise.all(cachePromises);
}

function tileKey(tile: TileCoord): string {
  return `${tile.z}:${tile.x}:${tile.y}`;
}

/** Generic deduplication helper — extracts unique values by key */
function deduplicateBy<TItem, TValue>(
  items: TItem[],
  keyFn: (item: TItem) => string,
  valueFn: (item: TItem) => TValue
): TValue[] {
  const seen = new Set<string>();
  const result: TValue[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(valueFn(item));
    }
  }
  return result;
}

/** Append POIs to the result map for a given factor */
function appendToResult(result: Map<string, POI[]>, factorId: string, pois: POI[]): void {
  const existing = result.get(factorId);
  if (existing) {
    existing.push(...pois);
  } else {
    result.set(factorId, [...pois]);
  }
}

/** Deduplicate POIs by location for each factor (mutates the map in place) */
function deduplicateResults(result: Map<string, POI[]>): void {
  for (const [factorId, pois] of result) {
    const seen = new Set<string>();
    result.set(factorId, pois.filter(poi => {
      const key = `${poi.lat.toFixed(COORDINATE_CONFIG.DEDUP_PRECISION)}:${poi.lng.toFixed(COORDINATE_CONFIG.DEDUP_PRECISION)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  }
}

const DEFAULT_VIEWPORT_BUFFER = 0.001;

/** Filter POIs to viewport bounds with optional buffer (default ~100m) */
export function filterPoisToViewport(
  poiData: Map<string, POI[]>,
  bounds: Bounds,
  buffer: number = DEFAULT_VIEWPORT_BUFFER
): Record<string, POI[]> {
  return filterPoisToBounds(poiData, bounds, buffer);
}

export function getPoiTileCacheStats(): CacheStats {
  return poiTileCache.getStats();
}
