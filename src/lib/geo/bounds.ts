import type { Bounds, POI } from '@/types';
import { tileToBounds } from './grid';
import type { TileCoord } from './tiles';

/**
 * Snap bounds to a grid for cache key generation
 * Rounds north/east up and south/west down to reduce cache fragmentation
 * 
 * @param bounds - The original geographic bounds
 * @param precision - Number of decimal places (default: 2, which gives ~1km precision)
 * @returns Snapped bounds
 */
export function snapBoundsForCacheKey(bounds: Bounds, precision: number = 2): Bounds {
  const multiplier = 10 ** precision;
  return {
    north: Math.ceil(bounds.north * multiplier) / multiplier,
    south: Math.floor(bounds.south * multiplier) / multiplier,
    east: Math.ceil(bounds.east * multiplier) / multiplier,
    west: Math.floor(bounds.west * multiplier) / multiplier,
  };
}

/**
 * Validate that bounds object has all required properties with valid values
 * 
 * @param bounds - The bounds object to validate
 * @returns true if bounds is valid, false otherwise
 */
export function isValidBounds(bounds: Bounds | null | undefined): bounds is Bounds {
  if (!bounds) return false;
  return (
    typeof bounds.north === 'number' && !isNaN(bounds.north) &&
    typeof bounds.south === 'number' && !isNaN(bounds.south) &&
    typeof bounds.east === 'number' && !isNaN(bounds.east) &&
    typeof bounds.west === 'number' && !isNaN(bounds.west)
  );
}

/**
 * Expand bounds by a buffer distance in degrees
 * Useful for fetching POIs outside the visible area to prevent edge effects
 * 
 * @param bounds - The original geographic bounds
 * @param buffer - Buffer distance in degrees (e.g., 0.1 ≈ 10km at mid-latitudes)
 * @returns Expanded bounds
 */
export function expandBounds(bounds: Bounds, buffer: number): Bounds {
  return {
    north: bounds.north + buffer,
    south: bounds.south - buffer,
    east: bounds.east + buffer,
    west: bounds.west - buffer,
  };
}

/**
 * Check if a point is within bounds (inclusive)
 * 
 * @param lat - Latitude of the point
 * @param lng - Longitude of the point
 * @param bounds - Geographic bounds to check against
 * @returns true if point is within bounds
 */
export function isPointInBounds(lat: number, lng: number, bounds: Bounds): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

/**
 * Calculate combined bounds that covers all tiles
 * 
 * @param tiles - Array of tile coordinates
 * @returns Combined bounds covering all tiles
 */
export function getCombinedBounds(tiles: TileCoord[]): Bounds {
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const tile of tiles) {
    const bounds = tileToBounds(tile.z, tile.x, tile.y);
    if (bounds.north > north) north = bounds.north;
    if (bounds.south < south) south = bounds.south;
    if (bounds.east > east) east = bounds.east;
    if (bounds.west < west) west = bounds.west;
  }

  return { north, south, east, west };
}

/**
 * Filter POIs from a Map to only those within bounds
 * Converts Map<string, POI[]> to Record<string, POI[]>
 * 
 * @param poiData - Map of factor ID to POI array
 * @param bounds - Geographic bounds to filter by
 * @returns Record of factor ID to filtered POI array
 */
export function filterPoisToBounds(
  poiData: Map<string, POI[]>,
  bounds: Bounds
): Record<string, POI[]> {
  const result: Record<string, POI[]> = {};
  poiData.forEach((pois, factorId) => {
    result[factorId] = pois.filter(
      (poi) =>
        poi.lat >= bounds.south &&
        poi.lat <= bounds.north &&
        poi.lng >= bounds.west &&
        poi.lng <= bounds.east
    );
  });
  return result;
}
