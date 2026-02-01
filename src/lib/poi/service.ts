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
import { getPOIsWithDetailsFromDB } from './db';
import { fetchAllPOIsCombined } from './overpass';
import { POIFetchError, DataSource } from '@/lib/errors';

export type { DataSource } from '@/lib/errors';

/**
 * Fetches POIs from the specified data source within the given bounds.
 * 
 * Returns POIs with full details (name, tags) for display purposes.
 * Both Neon and Overpass return consistent POI objects.
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
        // Use getPOIsWithDetailsFromDB to get full POI data (name, tags) for display
        const factorIds = factorTags.map(f => f.id);
        return await getPOIsWithDetailsFromDB(factorIds, bounds);
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
