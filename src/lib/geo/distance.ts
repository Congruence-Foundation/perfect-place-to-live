/**
 * Geographic distance utility functions
 */

import { METERS_PER_DEGREE_LAT } from './constants';

/**
 * Convert degrees to radians
 * 
 * Note: This is also duplicated in haversine.ts for internal use.
 * Exported here for use by other modules that need degree-to-radian conversion.
 */
function toRad(degrees: number): number {
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
 * use haversineDistance from @/lib/geo/haversine
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

/**
 * Create a unique coordinate key from lat/lng values
 * Uses 6 decimal places (~0.1m precision)
 * 
 * @param lat - Latitude
 * @param lng - Longitude
 * @param separator - Separator character (default: ':')
 * @returns Coordinate key string
 */
export function createCoordinateKey(lat: number, lng: number, separator: string = ':'): string {
  return `${lat.toFixed(6)}${separator}${lng.toFixed(6)}`;
}

/**
 * Create a cluster ID from lat/lng values
 * Uses 6 decimal places for precision
 * 
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Cluster ID string
 */
export function createClusterId(lat: number, lng: number): string {
  return `cluster-${lat.toFixed(6)}-${lng.toFixed(6)}`;
}
