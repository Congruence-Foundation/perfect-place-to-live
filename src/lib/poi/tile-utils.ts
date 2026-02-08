/**
 * Shared utilities for distributing POIs to tiles
 */

import type { POI } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getTileKeyString, latLngToTile } from '@/lib/geo/tiles';

function validateTileZoomConsistency(tiles: TileCoord[]): number {
  const zoom = tiles[0].z;
  const invalidTile = tiles.find(t => t.z !== zoom);

  if (invalidTile) {
    throw new Error(
      `All tiles must have the same zoom level. Expected ${zoom}, found ${invalidTile.z}`
    );
  }

  return zoom;
}

function buildTileKeySet(tiles: TileCoord[]): Set<string> {
  return new Set(tiles.map(getTileKeyString));
}

function initializeTileResultMap(
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

function findTileKeyForPoint(
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
 * Distribute POIs from a factor-keyed object to their respective tiles.
 * Uses O(1) tile lookup via coordinate calculation.
 */
export function distributePOIsByFactorToTiles(
  poisByFactor: Record<string, POI[]>,
  tiles: TileCoord[],
  factorIds: string[]
): Map<string, Record<string, POI[]>> {
  if (tiles.length === 0) {
    return new Map();
  }

  const zoom = validateTileZoomConsistency(tiles);
  const validTileKeys = buildTileKeySet(tiles);
  const result = initializeTileResultMap(tiles, factorIds);

  for (const [factorId, pois] of Object.entries(poisByFactor)) {
    for (const poi of pois) {
      const tileKey = findTileKeyForPoint(poi.lat, poi.lng, zoom, validTileKeys);
      if (tileKey) {
        result.get(tileKey)![factorId].push(poi);
      }
    }
  }

  return result;
}
