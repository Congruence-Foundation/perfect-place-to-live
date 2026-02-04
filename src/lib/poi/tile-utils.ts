/**
 * Shared utilities for distributing POIs to tiles
 */

import type { Bounds, POI } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { tileToBounds } from '@/lib/geo/grid';
import { isPointInBounds } from '@/lib/geo/bounds';
import { getTileKeyString } from '@/lib/geo/tiles';

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
 * Pre-compute tile bounds for efficient lookup
 */
export function computeTileBoundsMap(tiles: TileCoord[]): Map<string, Bounds> {
  const tileBoundsMap = new Map<string, Bounds>();
  
  for (const tile of tiles) {
    const key = getTileKeyString(tile);
    tileBoundsMap.set(key, tileToBounds(tile.z, tile.x, tile.y));
  }
  
  return tileBoundsMap;
}

/**
 * Find which tile contains a given point
 * Returns the tile key or undefined if not found
 */
export function findTileForPoint(
  lat: number,
  lng: number,
  tileBoundsMap: Map<string, Bounds>
): string | undefined {
  for (const [tileKey, bounds] of tileBoundsMap) {
    if (isPointInBounds(lat, lng, bounds)) {
      return tileKey;
    }
  }
  return undefined;
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
 * Generic version that can be used by both db.ts and overpass.ts
 */
export function distributePOIsByFactorToTiles(
  poisByFactor: Record<string, POI[]>,
  tiles: TileCoord[],
  factorIds: string[]
): Map<string, Record<string, POI[]>> {
  const tileBoundsMap = computeTileBoundsMap(tiles);
  const result = initializeTileResultMap(tiles, factorIds);

  for (const [factorId, pois] of Object.entries(poisByFactor)) {
    for (const poi of pois) {
      const tileKey = findTileForPoint(poi.lat, poi.lng, tileBoundsMap);
      
      if (tileKey) {
        assignPOIToTile(poi, factorId, tileKey, result);
      }
    }
  }

  return result;
}
