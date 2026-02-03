import type { Bounds } from '@/types';

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
 * Create a coordinate key string for deduplication
 * 
 * @param lat - Latitude
 * @param lng - Longitude
 * @param precision - Number of decimal places (default: 6, ~0.1m precision)
 * @returns Coordinate key string in format "lat:lng"
 */
export function createCoordKey(lat: number, lng: number, precision: number = 6): string {
  return `${lat.toFixed(precision)}:${lng.toFixed(precision)}`;
}
