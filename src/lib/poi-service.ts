/**
 * Unified POI fetching service
 * 
 * Provides a single interface for fetching POIs from either:
 * - Neon PostgreSQL database (fast, pre-cached)
 * - Overpass API (real-time, slower)
 */

import { Bounds, POI } from '@/types';
import { getPOIsFromDB } from './db';
import { fetchAllPOIsCombined } from './overpass';
import { POIFetchError, DataSource } from './errors';

export type { DataSource } from './errors';

/**
 * Fetches POIs from the specified data source within the given bounds.
 * 
 * @param factorTags - Array of factor definitions with IDs and OSM tags
 * @param bounds - Geographic bounding box
 * @param source - Data source: 'neon' (fast, cached) or 'overpass' (real-time)
 * @param signal - Optional AbortSignal for cancellation (only used with Overpass)
 * @returns POIs grouped by factor ID
 * @throws {POIFetchError} If the fetch operation fails
 * 
 * @example
 * const pois = await fetchPOIs(
 *   [{ id: 'pharmacy', osmTags: ['amenity=pharmacy'] }],
 *   bounds,
 *   'neon'
 * );
 */
export async function fetchPOIs(
  factorTags: { id: string; osmTags: string[] }[],
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
        // Extract just the factor IDs for the database query
        const factorIds = factorTags.map(f => f.id);
        return await getPOIsFromDB(factorIds, bounds);
    }
  } catch (error) {
    // Wrap the error with context about which source failed
    throw new POIFetchError(
      `Failed to fetch POIs from ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Check if a data source is available
 * 
 * @param source - The data source to check
 * @returns true if the source is available
 */
export async function isDataSourceAvailable(source: DataSource): Promise<boolean> {
  try {
    switch (source) {
      case 'neon':
        // Try a simple query to check database connectivity
        const { checkDatabaseConnection } = await import('./db');
        return await checkDatabaseConnection();
      
      case 'overpass':
        // Overpass is always "available" - it may be rate limited but that's handled by retry logic
        return true;
      
      default:
        return false;
    }
  } catch {
    return false;
  }
}
