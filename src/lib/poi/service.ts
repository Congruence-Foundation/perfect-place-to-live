/**
 * Unified POI fetching service
 * 
 * Provides a single interface for fetching POIs from either:
 * - Neon PostgreSQL database (fast, pre-cached)
 * - Overpass API (real-time, slower)
 * 
 * Both sources return POIs with consistent interface:
 * - id: number
 * - lat: number
 * - lng: number
 * - tags: Record<string, string>
 * - name?: string
 */

import type { Bounds, POI } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getPOIsFromDB, getPOIsForTilesBatched as getPOIsForTilesBatchedDB } from './db';
import { fetchAllPOIsCombined, fetchPOIsForTilesBatched as fetchPOIsForTilesBatchedOverpass } from './overpass';
import { POIFetchError, DataSource } from '@/lib/errors';
import { createTimer } from '@/lib/profiling';

export type { DataSource } from '@/lib/errors';

/**
 * Factor definition for POI fetching
 */
interface FactorDef {
  id: string;
  osmTags: string[];
}

/**
 * Fetches POIs from the specified data source within the given bounds.
 * 
 * @param factorTags - Array of factor definitions with IDs and OSM tags
 * @param bounds - Geographic bounding box
 * @param source - Data source: 'neon' (fast, cached) or 'overpass' (real-time)
 * @param signal - Optional AbortSignal for cancellation (only used with Overpass)
 * @returns POIs grouped by factor ID
 * @throws {POIFetchError} If the fetch operation fails
 */
export async function fetchPOIs(
  factorTags: FactorDef[],
  bounds: Bounds,
  source: DataSource = 'neon',
  signal?: AbortSignal
): Promise<Record<string, POI[]>> {
  try {
    switch (source) {
      case 'overpass':
        return await fetchAllPOIsCombined(factorTags, bounds, signal);
      
      case 'neon':
      default:
        const factorIds = factorTags.map(f => f.id);
        return await getPOIsFromDB(factorIds, bounds);
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
 * Fetches POIs for multiple tiles in a single batched operation.
 * 
 * This is significantly more efficient than fetching tiles individually:
 * - Single database/API call instead of N calls
 * - Avoids rate limiting issues with Overpass
 * - Reduces network overhead
 * 
 * @param tiles - Array of tile coordinates to fetch
 * @param factorTags - Array of factor definitions with IDs and OSM tags
 * @param source - Data source: 'neon' (fast, cached) or 'overpass' (real-time)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Map of tile key (z:x:y) to POIs grouped by factor ID
 * @throws {POIFetchError} If the fetch operation fails
 */
export async function fetchPOIsBatched(
  tiles: TileCoord[],
  factorTags: FactorDef[],
  source: DataSource = 'neon',
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
      default:
        const factorIds = factorTags.map(f => f.id);
        result = await getPOIsForTilesBatchedDB(tiles, factorIds);
        break;
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
