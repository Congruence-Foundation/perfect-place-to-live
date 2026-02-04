/**
 * Property tile utilities for the real estate extension
 * Uses fixed zoom level tiles for optimal cache efficiency
 */

import type { Bounds, TileCoordinates } from '@/types';
import type { PropertyFilters } from '@/extensions/real-estate/types';
import type { Factor } from '@/types/factors';
import { PROPERTY_TILE_CONFIG, HEATMAP_TILE_CONFIG, POI_TILE_CONFIG } from '@/constants/performance';
import { getTilesForBounds } from './grid';
import { djb2Hash } from '@/lib/utils';

/**
 * Tile coordinate type - re-exported from @/types for convenience
 */
export type TileCoord = TileCoordinates;

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
 * @param lat - Latitude in degrees
 * @param lng - Longitude in degrees
 * @param zoom - Zoom level
 * @returns Tile coordinates
 */
export function latLngToTile(lat: number, lng: number, zoom: number): TileCoord {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { z: zoom, x, y };
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
 * Heatmap configuration for cache key generation
 */
export interface HeatmapConfig {
  factors: Factor[];
  distanceCurve: string;
  sensitivity: number;
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
  const key = JSON.stringify({
    factors: enabledFactors,
    distanceCurve: config.distanceCurve,
    sensitivity: config.sensitivity,
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
 * Calculate how many neighboring tiles are needed for POI buffer
 * based on max factor distance and tile size
 * 
 * @param maxDistanceMeters - Maximum factor distance in meters
 * @param bufferScale - Multiplier for safety margin (default 2x)
 * @returns Number of tiles to expand in each direction
 */
export function calculatePoiTileRadius(
  maxDistanceMeters: number,
  bufferScale: number = POI_TILE_CONFIG.DEFAULT_POI_BUFFER_SCALE
): number {
  const tileSizeMeters = POI_TILE_CONFIG.TILE_SIZE_METERS;
  
  // Calculate radius: (maxDistance * scale) / tileSize, rounded up
  const radius = Math.ceil((maxDistanceMeters * bufferScale) / tileSizeMeters);
  
  // Cap at reasonable maximum to prevent excessive fetching
  return Math.min(radius, POI_TILE_CONFIG.MAX_POI_TILE_RADIUS);
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
  
  const poiRadius = calculatePoiTileRadius(maxDistanceMeters, bufferScale);
  return getExpandedTilesForRadius(heatmapTiles, poiRadius);
}
