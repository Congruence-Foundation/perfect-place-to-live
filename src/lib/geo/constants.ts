/**
 * Geographic constants
 */

/** Earth's radius in meters */
export const EARTH_RADIUS_METERS = 6371000;

/** Meters per degree of latitude (approximately constant) */
export const METERS_PER_DEGREE_LAT = 111320;

/** Conversion factor from degrees to radians */
export const DEG_TO_RAD = Math.PI / 180;

/**
 * Poland geographic bounds
 */
export const POLAND_BOUNDS = {
  north: 54.9,
  south: 49.0,
  east: 24.2,
  west: 14.1,
} as const;

/**
 * Poland geographic center
 */
export const POLAND_CENTER = {
  lat: 52.0,
  lng: 19.0,
} as const;

/**
 * Overpass API endpoint URL
 */
export const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
