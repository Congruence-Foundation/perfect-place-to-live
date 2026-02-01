import { Bounds } from '@/types';

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
 * Check if a viewport is fully contained within covered bounds
 * Used to determine if existing heatmap data covers the current view
 * 
 * @param viewport - The current viewport bounds
 * @param coveredBounds - The bounds that are currently covered by data
 * @returns true if viewport is fully within coveredBounds
 */
export function isViewportCovered(viewport: Bounds, coveredBounds: Bounds | null): boolean {
  if (!coveredBounds) return false;
  return (
    viewport.north <= coveredBounds.north &&
    viewport.south >= coveredBounds.south &&
    viewport.east <= coveredBounds.east &&
    viewport.west >= coveredBounds.west
  );
}

/**
 * Check if bounds exceed a maximum size threshold
 * Used to prevent fetching data for very large viewports
 * 
 * @param bounds - The geographic bounds
 * @param maxLatRange - Maximum allowed latitude range (default: 0.5)
 * @param maxLngRange - Maximum allowed longitude range (default: 0.75)
 * @returns true if bounds exceed the threshold
 */
export function isBoundsTooLarge(
  bounds: Bounds,
  maxLatRange: number = 0.5,
  maxLngRange: number = 0.75
): boolean {
  const latRange = bounds.north - bounds.south;
  const lngRange = bounds.east - bounds.west;
  return latRange > maxLatRange || lngRange > maxLngRange;
}
