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
 * Calculate the Haversine distance between two points in meters
 * More accurate than simple Euclidean approximation for larger distances
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculate the distance in meters between two geographic points
 * Uses simple Euclidean approximation - faster but less accurate for large distances
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
