/**
 * Geographic utility functions and constants
 * Consolidates duplicated geo calculations from across the codebase
 */

/** Earth's radius in meters */
export const EARTH_RADIUS_METERS = 6371000;

/** Meters per degree of latitude (approximately constant) */
export const METERS_PER_DEGREE_LAT = 111320;

/**
 * Convert degrees to radians
 */
export function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate meters per degree of longitude at a given latitude
 * Longitude degrees get smaller as you move away from the equator
 */
export function metersPerDegreeLng(lat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos(lat * (Math.PI / 180));
}

/**
 * Calculate the distance in meters between two geographic points
 * Uses simple Euclidean approximation - faster but less accurate for large distances
 * 
 * For more accurate distance calculations over larger distances,
 * use haversineDistance from @/lib/haversine
 */
export function distanceInMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const avgLat = (lat1 + lat2) / 2;
  const latDiff = (lat2 - lat1) * METERS_PER_DEGREE_LAT;
  const lngDiff = (lng2 - lng1) * metersPerDegreeLng(avgLat);
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}
