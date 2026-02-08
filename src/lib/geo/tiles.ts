/**
 * Property tile utilities for the real estate extension
 * Uses fixed zoom level tiles for optimal cache efficiency
 */

import type { Bounds, TileCoordinates } from '@/types';
import type { PropertyFilters } from '@/extensions/real-estate/types';
import type { Factor } from '@/types/factors';
import { PROPERTY_TILE_CONFIG, HEATMAP_TILE_CONFIG, POI_TILE_CONFIG, POWER_MEAN_CONFIG } from '@/constants/performance';
import { getTilesForBounds } from './grid';
import { djb2Hash } from '@/lib/utils';
import { DEG_TO_RAD } from './constants';

/**
 * Tile coordinate type - re-exported from @/types for convenience
 */
export type TileCoord = TileCoordinates;

/**
 * Result of tile calculation with radius expansion
 */
export interface TileCalculationResult {
  /** Tiles within the viewport bounds */
  viewportTiles: TileCoord[];
  /** All tiles including expanded radius */
  allTiles: TileCoord[];
  /** Whether the viewport has too many tiles */
  isTooLarge: boolean;
}

/**
 * Options for tile calculation
 */
export interface TileCalculationOptions {
  /** Viewport bounds */
  bounds: Bounds | null;
  /** Zoom level for tiles */
  tileZoom: number;
  /** Number of tiles to expand around viewport */
  radius: number;
  /** Maximum viewport tiles before marking as too large */
  maxViewportTiles: number;
  /** Maximum total tiles (will reduce radius if exceeded) */
  maxTotalTiles: number;
}

/**
 * Calculate tiles for a viewport with radius expansion
 * Automatically reduces radius if too many tiles would be generated
 * 
 * @param options - Tile calculation options
 * @returns Viewport tiles, expanded tiles, and whether viewport is too large
 */
export function calculateTilesWithRadius(options: TileCalculationOptions): TileCalculationResult {
  const { bounds, tileZoom, radius, maxViewportTiles, maxTotalTiles } = options;
  
  if (!bounds) {
    return { viewportTiles: [], allTiles: [], isTooLarge: false };
  }

  const viewport = getTilesForBounds(bounds, tileZoom);

  if (viewport.length > maxViewportTiles) {
    return { viewportTiles: [], allTiles: [], isTooLarge: true };
  }

  let expanded = getExpandedTilesForRadius(viewport, radius);

  // Reduce radius if too many tiles
  if (expanded.length > maxTotalTiles) {
    let reducedRadius = radius;
    while (expanded.length > maxTotalTiles && reducedRadius > 0) {
      reducedRadius--;
      expanded = getExpandedTilesForRadius(viewport, reducedRadius);
    }
  }

  return { viewportTiles: viewport, allTiles: expanded, isTooLarge: false };
}

/**
 * Generate a string key from tile coordinates
 * Used for cache keys and deduplication
 * 
 * @param tile - Tile coordinates
 * @returns String key in format "z:x:y"
 */
export function getTileKeyString(tile: TileCoord): string {
  return `${tile.z}:${tile.x}:${tile.y}`;
}

/**
 * Convert latitude/longitude to tile coordinates at a given zoom level
 * Uses Web Mercator projection (EPSG:3857)
 * 
 * @param lat - Latitude in degrees (clamped to ±85.051° for Web Mercator)
 * @param lng - Longitude in degrees
 * @param zoom - Zoom level
 * @returns Tile coordinates
 */
export function latLngToTile(lat: number, lng: number, zoom: number): TileCoord {
  const n = Math.pow(2, zoom);
  
  // Clamp latitude to Web Mercator bounds (±85.051°) to avoid Math.tan/cos issues
  // At ±90°, tan(lat) approaches infinity and cos(lat) approaches 0
  const clampedLat = Math.max(-85.051, Math.min(85.051, lat));
  
  // Normalize longitude to [-180, 180) range
  let normalizedLng = ((lng + 180) % 360) - 180;
  if (normalizedLng < -180) normalizedLng += 360;
  
  const x = Math.floor((normalizedLng + 180) / 360 * n);
  const latRad = clampedLat * DEG_TO_RAD;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  
  // Clamp x and y to valid tile range
  const maxTile = n - 1;
  return { 
    z: zoom, 
    x: Math.max(0, Math.min(maxTile, x)), 
    y: Math.max(0, Math.min(maxTile, y)) 
  };
}

/**
 * Fixed zoom level for property tiles
 * Using zoom 13 provides ~2.4km x 2.4km tiles at Poland's latitude
 */
export const PROPERTY_TILE_ZOOM = PROPERTY_TILE_CONFIG.TILE_ZOOM;

/**
 * Expand a set of tiles by a radius in all directions
 * Used to include neighboring tiles for price analysis or POI fetching
 * 
 * @param tiles - Array of tile coordinates
 * @param radius - Number of tile layers to add around the viewport
 * @returns Expanded array of tile coordinates
 */
function getExpandedTilesForRadius(
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

  return generateTileGrid(minX, maxX, minY, maxY, z, radius);
}

/**
 * Generate a grid of tiles within bounds, optionally expanded by a radius
 * 
 * @param minX - Minimum X tile coordinate
 * @param maxX - Maximum X tile coordinate
 * @param minY - Minimum Y tile coordinate
 * @param maxY - Maximum Y tile coordinate
 * @param z - Zoom level
 * @param radius - Number of tile layers to add around the bounds (default 0)
 * @returns Array of tile coordinates
 */
function generateTileGrid(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  z: number,
  radius: number = 0
): TileCoord[] {
  const tiles: TileCoord[] = [];
  const maxTileIndex = Math.pow(2, z) - 1;

  for (let x = minX - radius; x <= maxX + radius; x++) {
    for (let y = minY - radius; y <= maxY + radius; y++) {
      // Clamp to valid tile coordinates
      if (x >= 0 && y >= 0 && x <= maxTileIndex && y <= maxTileIndex) {
        tiles.push({ x, y, z });
      }
    }
  }

  return tiles;
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

  return djb2Hash(key);
}

// ============================================================================
// Heatmap Tile Utilities
// ============================================================================

/**
 * Fixed zoom level for heatmap tiles
 * Using zoom 13 provides ~2.4km x 2.4km tiles at Poland's latitude
 */
export const HEATMAP_TILE_ZOOM = HEATMAP_TILE_CONFIG.TILE_ZOOM;

/**
 * Calculate the difference between two tile sets (tiles in larger set but not in smaller set)
 * Used for progressive pre-fetching to determine which tiles need to be fetched at each radius
 * 
 * @param largerSet - The expanded tile set (e.g., viewport + radius N)
 * @param smallerSet - The base tile set (e.g., viewport + radius N-1)
 * @returns Array of tiles that are in largerSet but not in smallerSet
 */
export function calculateTileDelta(
  largerSet: TileCoord[],
  smallerSet: TileCoord[]
): TileCoord[] {
  const smallerKeys = new Set(smallerSet.map(getTileKeyString));
  return largerSet.filter(t => !smallerKeys.has(getTileKeyString(t)));
}

/**
 * Heatmap configuration for cache key generation
 */
export interface HeatmapConfig {
  factors: Factor[];
  distanceCurve: string;
  sensitivity: number;
  lambda?: number;
}

/**
 * Create a stable hash from heatmap configuration
 * Used as part of the cache key to differentiate tiles with different settings
 * 
 * @param config - Heatmap configuration object
 * @returns Hash string
 */
export function hashHeatmapConfig(config: HeatmapConfig): string {
  // Only include enabled factors with their weights and maxDistance
  const enabledFactors = config.factors
    .filter(f => f.enabled)
    .map(f => ({
      id: f.id,
      weight: f.weight,
      maxDistance: f.maxDistance,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Create a stable, sorted representation
  // Include lambda with default for backward compatibility
  const key = JSON.stringify({
    factors: enabledFactors,
    distanceCurve: config.distanceCurve,
    sensitivity: config.sensitivity,
    lambda: config.lambda ?? POWER_MEAN_CONFIG.DEFAULT_LAMBDA,
  });

  return djb2Hash(key);
}

/**
 * Generate a cache key for a heatmap tile
 * @param z - Zoom level
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param configHash - Hash of the heatmap configuration
 * @returns Cache key string
 */
export function getHeatmapTileKey(z: number, x: number, y: number, configHash: string): string {
  return `heatmap-tile:${z}:${x}:${y}:${configHash}`;
}

// ============================================================================
// POI Tile Utilities (Tile-Aligned POI Caching)
// ============================================================================

/**
 * Generate a cache key for a POI tile
 * @param z - Zoom level
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param factorId - Factor ID for this POI type
 * @returns Cache key string
 */
export function getPoiTileKey(z: number, x: number, y: number, factorId: string): string {
  return `poi-tile:${z}:${x}:${y}:${factorId}`;
}

/**
 * Get all POI tiles needed for scoring a set of heatmap tiles
 * 
 * @param heatmapTiles - Array of heatmap tile coordinates
 * @param maxDistanceMeters - Maximum factor distance in meters
 * @param bufferScale - Multiplier for safety margin
 * @returns Array of POI tile coordinates
 */
export function getPoiTilesForHeatmapTiles(
  heatmapTiles: TileCoord[],
  maxDistanceMeters: number,
  bufferScale: number
): TileCoord[] {
  if (heatmapTiles.length === 0) return [];
  
  // Calculate how many neighboring tiles are needed for POI buffer
  // Formula: (maxDistance * scale) / tileSize, rounded up, capped at max
  const tileSizeMeters = POI_TILE_CONFIG.TILE_SIZE_METERS;
  const poiRadius = Math.min(
    Math.ceil((maxDistanceMeters * bufferScale) / tileSizeMeters),
    POI_TILE_CONFIG.MAX_POI_TILE_RADIUS
  );
  
  return getExpandedTilesForRadius(heatmapTiles, poiRadius);
}
