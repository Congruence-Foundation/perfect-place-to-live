/**
 * Geographic distance utility functions
 */

import { METERS_PER_DEGREE_LAT, DEG_TO_RAD } from './constants';

/**
 * Calculate meters per degree of longitude at a given latitude
 * Longitude degrees get smaller as you move away from the equator
 * 
 * Note: At poles (±90°), cos(lat) approaches 0, so we clamp to a minimum
 * to avoid division-by-zero issues in downstream calculations.
 */
export function metersPerDegreeLng(lat: number): number {
  // Clamp latitude to avoid issues at poles where cos(90°) ≈ 0
  const clampedLat = Math.max(-89.9, Math.min(89.9, lat));
  return METERS_PER_DEGREE_LAT * Math.cos(clampedLat * DEG_TO_RAD);
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
  // Handle edge cases: NaN or Infinity coordinates
  if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || 
      !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
    return Infinity;
  }
  
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
  // Handle edge cases: NaN or Infinity coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return `invalid${separator}invalid`;
  }
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
  return `cluster-${createCoordinateKey(lat, lng, '-')}`;
}
