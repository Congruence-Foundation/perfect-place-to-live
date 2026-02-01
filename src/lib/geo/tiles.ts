/**
 * Property tile utilities for the real estate extension
 * Uses fixed zoom level tiles for optimal cache efficiency
 */

import type { Bounds } from '@/types';
import type { PropertyFilters } from '@/extensions/real-estate/types';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';
import { getTilesForBounds } from './grid';

/**
 * Tile coordinate type
 */
export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Fixed zoom level for property tiles
 * Using zoom 13 provides ~2.4km x 2.4km tiles at Poland's latitude
 */
export const PROPERTY_TILE_ZOOM = PROPERTY_TILE_CONFIG.TILE_ZOOM;

/**
 * Generate a cache key for a property tile
 * @param z - Zoom level
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param filterHash - Hash of the property filters
 * @returns Cache key string
 */
export function getTileKey(z: number, x: number, y: number, filterHash: string): string {
  return `prop-tile:${z}:${x}:${y}:${filterHash}`;
}

/**
 * Expand a set of tiles by a radius in all directions
 * Used to include neighboring tiles for price analysis
 * 
 * @param tiles - Array of tile coordinates
 * @param radius - Number of tile layers to add around the viewport
 * @returns Expanded array of tile coordinates
 */
export function getExpandedTilesForRadius(
  tiles: TileCoord[],
  radius: number
): TileCoord[] {
  if (radius === 0 || tiles.length === 0) return tiles;

  // Find bounding box of viewport tiles
  const minX = Math.min(...tiles.map(t => t.x));
  const maxX = Math.max(...tiles.map(t => t.x));
  const minY = Math.min(...tiles.map(t => t.y));
  const maxY = Math.max(...tiles.map(t => t.y));
  const z = tiles[0].z;

  // Expand by radius in all directions
  const expanded: TileCoord[] = [];
  const maxTileIndex = Math.pow(2, z) - 1;

  for (let x = minX - radius; x <= maxX + radius; x++) {
    for (let y = minY - radius; y <= maxY + radius; y++) {
      // Clamp to valid tile coordinates
      if (x >= 0 && y >= 0 && x <= maxTileIndex && y <= maxTileIndex) {
        expanded.push({ x, y, z });
      }
    }
  }

  return expanded;
}

/**
 * Create a stable hash from property filters
 * Used as part of the cache key to differentiate tiles with different filters
 * 
 * @param filters - Property filters object
 * @returns Hash string
 */
export function hashFilters(filters: PropertyFilters): string {
  // Create a stable, sorted representation of filter values
  const key = JSON.stringify({
    transaction: filters.transaction,
    estate: filters.estate?.slice().sort(),
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    areaMin: filters.areaMin,
    areaMax: filters.areaMax,
    roomsNumber: filters.roomsNumber?.slice().sort(),
    ownerType: filters.ownerType,
    market: filters.market,
    pricePerMeterMin: filters.pricePerMeterMin,
    pricePerMeterMax: filters.pricePerMeterMax,
    buildYearMin: filters.buildYearMin,
    buildYearMax: filters.buildYearMax,
    buildingMaterial: filters.buildingMaterial?.slice().sort(),
    daysSinceCreated: filters.daysSinceCreated,
    extras: filters.extras?.slice().sort(),
    floors: filters.floors?.slice().sort(),
    floorsNumberMin: filters.floorsNumberMin,
    floorsNumberMax: filters.floorsNumberMax,
    flatBuildingType: filters.flatBuildingType?.slice().sort(),
    terrainAreaMin: filters.terrainAreaMin,
    terrainAreaMax: filters.terrainAreaMax,
    houseBuildingType: filters.houseBuildingType?.slice().sort(),
    isBungalow: filters.isBungalow,
  });

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) + key.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Check if the viewport is too large for tile-based fetching
 * Returns true if the number of tiles exceeds the maximum allowed
 * 
 * @param bounds - Geographic bounds of the viewport
 * @param tileZoom - Zoom level for tiles (defaults to PROPERTY_TILE_ZOOM)
 * @returns True if viewport is too large
 */
export function isViewportTooLarge(
  bounds: Bounds,
  tileZoom: number = PROPERTY_TILE_ZOOM
): boolean {
  const tiles = getTilesForBounds(bounds, tileZoom);
  return tiles.length > PROPERTY_TILE_CONFIG.MAX_VIEWPORT_TILES;
}

/**
 * Get property tiles for a viewport with optional radius expansion
 * 
 * @param bounds - Geographic bounds of the viewport
 * @param radius - Number of tile layers to add around the viewport (default: 0)
 * @returns Object containing viewport tiles, all tiles, and whether viewport is too large
 */
export function getPropertyTilesForBounds(
  bounds: Bounds,
  radius: number = 0
): {
  viewportTiles: TileCoord[];
  allTiles: TileCoord[];
  isTooLarge: boolean;
} {
  const tileZoom = PROPERTY_TILE_ZOOM;
  const viewportTiles = getTilesForBounds(bounds, tileZoom);

  if (viewportTiles.length > PROPERTY_TILE_CONFIG.MAX_VIEWPORT_TILES) {
    return { viewportTiles: [], allTiles: [], isTooLarge: true };
  }

  const allTiles = getExpandedTilesForRadius(viewportTiles, radius);

  // Check if total tiles exceed hard limit
  if (allTiles.length > PROPERTY_TILE_CONFIG.MAX_TOTAL_TILES) {
    // Reduce radius until within limit
    let reducedRadius = radius;
    let reducedTiles = allTiles;
    
    while (reducedTiles.length > PROPERTY_TILE_CONFIG.MAX_TOTAL_TILES && reducedRadius > 0) {
      reducedRadius--;
      reducedTiles = getExpandedTilesForRadius(viewportTiles, reducedRadius);
    }
    
    return { viewportTiles, allTiles: reducedTiles, isTooLarge: false };
  }

  return { viewportTiles, allTiles, isTooLarge: false };
}

/**
 * Separate viewport tiles from buffer tiles
 * Useful for prioritizing viewport tiles in batched fetching
 * 
 * @param viewportTiles - Tiles within the viewport
 * @param allTiles - All tiles including buffer
 * @returns Object with viewport and buffer tiles separated
 */
export function separateViewportAndBufferTiles(
  viewportTiles: TileCoord[],
  allTiles: TileCoord[]
): {
  viewport: TileCoord[];
  buffer: TileCoord[];
} {
  const viewportSet = new Set(
    viewportTiles.map(t => `${t.z}:${t.x}:${t.y}`)
  );

  const buffer = allTiles.filter(
    t => !viewportSet.has(`${t.z}:${t.x}:${t.y}`)
  );

  return { viewport: viewportTiles, buffer };
}
