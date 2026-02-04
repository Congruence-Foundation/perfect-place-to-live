/**
 * Shared utilities for distributing POIs to tiles
 */

import type { POI } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getTileKeyString, latLngToTile } from '@/lib/geo/tiles';

/**
 * Initialize an empty result map with arrays for each tile and factor
 */
export function initializeTileResultMap(
  tiles: TileCoord[],
  factorIds: string[]
): Map<string, Record<string, POI[]>> {
  const result = new Map<string, Record<string, POI[]>>();
  
  for (const tile of tiles) {
    const key = getTileKeyString(tile);
    const factorMap: Record<string, POI[]> = {};
    for (const factorId of factorIds) {
      factorMap[factorId] = [];
    }
    result.set(key, factorMap);
  }
  
  return result;
}

/**
 * Find which tile contains a given point using direct coordinate calculation.
 * O(1) lookup instead of O(tiles) linear search.
 * 
 * @param lat - Latitude of the point
 * @param lng - Longitude of the point
 * @param zoom - Zoom level of the tiles
 * @param validTileKeys - Set of valid tile keys to check against
 * @returns The tile key or undefined if not in any valid tile
 */
export function findTileForPointFast(
  lat: number,
  lng: number,
  zoom: number,
  validTileKeys: Set<string>
): string | undefined {
  const tile = latLngToTile(lat, lng, zoom);
  const key = getTileKeyString(tile);
  return validTileKeys.has(key) ? key : undefined;
}

/**
 * Assign a POI to its corresponding tile in the result map
 */
export function assignPOIToTile(
  poi: POI,
  factorId: string,
  tileKey: string,
  result: Map<string, Record<string, POI[]>>
): void {
  const tileData = result.get(tileKey);
  if (tileData?.[factorId]) {
    tileData[factorId].push(poi);
  }
}

/**
 * Distribute POIs from a factor-keyed object to their respective tiles
 * Uses O(1) tile lookup for better performance with large POI sets
 */
export function distributePOIsByFactorToTiles(
  poisByFactor: Record<string, POI[]>,
  tiles: TileCoord[],
  factorIds: string[]
): Map<string, Record<string, POI[]>> {
  if (tiles.length === 0) {
    return new Map();
  }

  // Get zoom level from first tile (all tiles should have same zoom)
  const zoom = tiles[0].z;
  
  // Build set of valid tile keys for O(1) lookup
  const validTileKeys = new Set<string>();
  for (const tile of tiles) {
    validTileKeys.add(getTileKeyString(tile));
  }
  
  const result = initializeTileResultMap(tiles, factorIds);

  for (const [factorId, pois] of Object.entries(poisByFactor)) {
    for (const poi of pois) {
      const tileKey = findTileForPointFast(poi.lat, poi.lng, zoom, validTileKeys);
      
      if (tileKey) {
        assignPOIToTile(poi, factorId, tileKey, result);
      }
    }
  }

  return result;
}
