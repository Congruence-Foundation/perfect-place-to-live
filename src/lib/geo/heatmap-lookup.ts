/**
 * Heatmap point lookup utilities
 * 
 * Provides efficient nearest-neighbor lookup for heatmap points
 * using spatial indexing for O(1) average lookup.
 */

import type { HeatmapPoint } from '@/types/heatmap';
import { distanceInMeters } from './distance';
import { METERS_PER_DEGREE_LAT } from './constants';
import { GenericSpatialIndex } from './haversine';
import { UI_CONFIG, HEATMAP_LOOKUP_CONFIG } from '@/constants/performance';

/**
 * Distance function for heatmap points using distanceInMeters
 */
function heatmapDistanceFn(p1: { lat: number; lng: number }, p2: HeatmapPoint): number {
  return distanceInMeters(p1.lat, p1.lng, p2.lat, p2.lng);
}

/**
 * Module-level cache for spatial indexes
 * 
 * Design note: This uses simple module-level state rather than a full LRU cache
 * because we only ever need one spatial index at a time (for the current heatmap).
 * The cache is invalidated when heatmap points change (detected via hash).
 * 
 * This approach is simpler and sufficient for the use case. A full LRU cache
 * would add complexity without significant benefit since we don't need to
 * cache multiple spatial indexes simultaneously.
 */
let cachedIndex: GenericSpatialIndex<HeatmapPoint> | null = null;
let cachedPointsHash: string | null = null;

/**
 * Get or create a spatial index for the given heatmap points
 */
function getSpatialIndex(heatmapPoints: HeatmapPoint[]): GenericSpatialIndex<HeatmapPoint> {
  // Simple hash based on first and last points and length
  const hash = heatmapPoints.length > 0
    ? `${heatmapPoints.length}:${heatmapPoints[0].lat}:${heatmapPoints[heatmapPoints.length - 1].lat}`
    : '';
  
  if (cachedIndex && cachedPointsHash === hash) {
    return cachedIndex;
  }
  
  // Convert cell size from meters to degrees (approximate)
  const cellSizeDegrees = HEATMAP_LOOKUP_CONFIG.SPATIAL_INDEX_CELL_SIZE_METERS / METERS_PER_DEGREE_LAT;
  cachedIndex = new GenericSpatialIndex(heatmapPoints, heatmapDistanceFn, cellSizeDegrees);
  cachedPointsHash = hash;
  return cachedIndex;
}

/**
 * Find the nearest heatmap point to a given location within a search radius.
 * Uses spatial indexing for O(1) average lookup instead of O(n) linear search.
 * 
 * @param lat - Latitude of the location
 * @param lng - Longitude of the location
 * @param heatmapPoints - Array of heatmap points with scores
 * @param searchRadius - Maximum search radius in meters
 * @returns The nearest heatmap point or null if none found within radius
 */
export function findNearestHeatmapPoint(
  lat: number,
  lng: number,
  heatmapPoints: HeatmapPoint[],
  searchRadius: number
): HeatmapPoint | null {
  if (!heatmapPoints || heatmapPoints.length === 0) {
    return null;
  }

  // For small arrays, linear search is faster than building an index
  if (heatmapPoints.length < HEATMAP_LOOKUP_CONFIG.LINEAR_SEARCH_THRESHOLD) {
    let nearestPoint: HeatmapPoint | null = null;
    let nearestDistance = Infinity;

    for (const point of heatmapPoints) {
      const distance = distanceInMeters(lat, lng, point.lat, point.lng);
      if (distance < nearestDistance && distance <= searchRadius) {
        nearestDistance = distance;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  // Use spatial index for larger arrays
  const index = getSpatialIndex(heatmapPoints);
  const result = index.findNearest({ lat, lng }, searchRadius);
  return result ? result.item : null;
}

/**
 * Get the heatmap score (K value) for a specific location.
 * Uses nearest-neighbor lookup to find the closest heatmap point.
 * 
 * @param lat - Latitude of the location
 * @param lng - Longitude of the location
 * @param heatmapPoints - Array of heatmap points with scores
 * @param gridCellSize - Grid cell size in meters (used to determine search radius)
 * @returns K value (0-1, where 0 is best) or null if no nearby point found
 */
export function getScoreForLocation(
  lat: number,
  lng: number,
  heatmapPoints: HeatmapPoint[],
  gridCellSize: number = UI_CONFIG.DEFAULT_GRID_CELL_SIZE
): number | null {
  const searchRadius = gridCellSize * UI_CONFIG.SEARCH_RADIUS_MULTIPLIER;
  const nearestPoint = findNearestHeatmapPoint(lat, lng, heatmapPoints, searchRadius);
  return nearestPoint ? nearestPoint.value : null;
}
