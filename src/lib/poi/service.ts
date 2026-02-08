import type { Bounds, POI, FactorDef, POIDataSource } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getPOIsFromDB, getPOIsForTilesBatched as getPOIsForTilesBatchedDB } from './db';
import { fetchAllPOIsCombined, fetchPOIsForTilesBatched as fetchPOIsForTilesBatchedOverpass } from './overpass';
import { POIFetchError } from '@/lib/errors';
import { createTimer } from '@/lib/profiling';
import { cacheGet, cacheSet } from '@/lib/cache';
import { generatePOICacheKey } from './overpass';
import { PERFORMANCE_CONFIG } from '@/constants/performance';

const { POI_CACHE_TTL_SECONDS } = PERFORMANCE_CONFIG;

/**
 * Result of POI fetching with fallback
 */
export interface FetchPoisWithFallbackResult {
  poiData: Map<string, POI[]>;
  actualDataSource: POIDataSource;
}

/**
 * Store POIs in cache and add to the result map
 */
async function storePOIsInCache(
  fetchedPOIs: Record<string, POI[]>,
  poiData: Map<string, POI[]>,
  bounds: Bounds
): Promise<void> {
  for (const [factorId, pois] of Object.entries(fetchedPOIs)) {
    poiData.set(factorId, pois);
    const cacheKey = generatePOICacheKey(factorId, bounds);
    await cacheSet(cacheKey, pois, POI_CACHE_TTL_SECONDS);
  }
}

/**
 * Initialize empty arrays for factors that failed to fetch
 */
function initializeEmptyFactors(
  factors: FactorDef[],
  poiData: Map<string, POI[]>
): void {
  for (const factor of factors) {
    if (!poiData.has(factor.id)) {
      poiData.set(factor.id, []);
    }
  }
}

/**
 * Attempt to fetch POIs from Overpass as a fallback
 */
async function fetchFromOverpassFallback(
  factors: FactorDef[],
  bounds: Bounds,
  poiData: Map<string, POI[]>
): Promise<boolean> {
  try {
    const overpassPOIs = await fetchPOIs(factors, bounds, 'overpass');
    await storePOIsInCache(overpassPOIs, poiData, bounds);
    return true;
  } catch (overpassError) {
    console.error('Overpass fallback also failed:', overpassError);
    initializeEmptyFactors(factors, poiData);
    return false;
  }
}

/**
 * Fetches POIs with automatic fallback from Neon to Overpass.
 * Checks cache, fetches uncached, falls back on empty/error, and caches results.
 */
export async function fetchPOIsWithFallback(
  factors: FactorDef[],
  bounds: Bounds,
  preferredSource: POIDataSource = 'neon',
  existingPoiData?: Map<string, POI[]>
): Promise<FetchPoisWithFallbackResult> {
  const poiData = existingPoiData ? new Map(existingPoiData) : new Map<string, POI[]>();
  const uncachedFactors: FactorDef[] = [];
  let actualDataSource: POIDataSource = preferredSource;

  // Check cache first for Neon source (parallel lookups)
  if (preferredSource === 'neon') {
    const cacheResults = await Promise.all(
      factors.map(async (factor) => {
        const cacheKey = generatePOICacheKey(factor.id, bounds);
        const cached = await cacheGet<POI[]>(cacheKey);
        return { factor, cached };
      })
    );

    for (const { factor, cached } of cacheResults) {
      if (cached) {
        poiData.set(factor.id, cached);
      } else {
        uncachedFactors.push(factor);
      }
    }
  } else {
    // For Overpass, always fetch fresh data
    uncachedFactors.push(...factors);
  }

  // Fetch uncached POIs
  if (uncachedFactors.length > 0) {
    try {
      const fetchedPOIs = await fetchPOIs(uncachedFactors, bounds, actualDataSource);
      
      // Check if Neon returned empty results - might need to fallback to Overpass
      const totalPOIs = Object.values(fetchedPOIs).reduce((sum, pois) => sum + pois.length, 0);
      
      if (actualDataSource === 'neon' && totalPOIs === 0) {
        // No data in Neon DB for this area - try Overpass as fallback
        console.log('No POIs found in Neon DB, falling back to Overpass API...');
        actualDataSource = 'overpass';
        await fetchFromOverpassFallback(uncachedFactors, bounds, poiData);
      } else {
        await storePOIsInCache(fetchedPOIs, poiData, bounds);
      }
    } catch (error) {
      console.error(`Error fetching POIs from ${actualDataSource}:`, error);
      
      // If Neon failed, try Overpass as fallback
      if (actualDataSource === 'neon') {
        console.log('Neon DB error, falling back to Overpass API...');
        actualDataSource = 'overpass';
        await fetchFromOverpassFallback(uncachedFactors, bounds, poiData);
      } else {
        initializeEmptyFactors(uncachedFactors, poiData);
      }
    }
  }

  return { poiData, actualDataSource };
}

/**
 * Fetches POIs from the specified data source.
 * @throws {POIFetchError}
 */
export async function fetchPOIs(
  factorTags: FactorDef[],
  bounds: Bounds,
  source: POIDataSource = 'neon',
  signal?: AbortSignal
): Promise<Record<string, POI[]>> {
  try {
    switch (source) {
      case 'overpass':
        return await fetchAllPOIsCombined(factorTags, bounds, signal);
      
      case 'neon':
      default: {
        const factorIds = factorTags.map(f => f.id);
        return await getPOIsFromDB(factorIds, bounds);
      }
    }
  } catch (error) {
    throw new POIFetchError(
      `Failed to fetch POIs from ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Fetches POIs for multiple tiles in a single batched query.
 * @throws {POIFetchError}
 */
export async function fetchPOIsBatched(
  tiles: TileCoord[],
  factorTags: FactorDef[],
  source: POIDataSource = 'neon',
  signal?: AbortSignal
): Promise<Map<string, Record<string, POI[]>>> {
  if (tiles.length === 0 || factorTags.length === 0) {
    return new Map();
  }

  const stopTimer = createTimer('poi-service:batch-fetch');
  
  try {
    let result: Map<string, Record<string, POI[]>>;
    
    switch (source) {
      case 'overpass':
        result = await fetchPOIsForTilesBatchedOverpass(tiles, factorTags, signal);
        break;
      
      case 'neon':
      default: {
        const factorIds = factorTags.map(f => f.id);
        result = await getPOIsForTilesBatchedDB(tiles, factorIds);
        break;
      }
    }
    
    stopTimer({ tiles: tiles.length, factors: factorTags.length, source });
    return result;
  } catch (error) {
    stopTimer({ tiles: tiles.length, factors: factorTags.length, source, error: true });
    throw new POIFetchError(
      `Failed to batch fetch POIs from ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source,
      error instanceof Error ? error : undefined
    );
  }
}
