import type { HeatmapPoint } from '@/types/heatmap';
import type { UnifiedProperty, UnifiedCluster } from './shared/types';
import { distanceInMeters, METERS_PER_DEGREE_LAT } from '@/lib/geo';
import { GenericSpatialIndex, type GeoLocated } from '@/lib/geo/haversine';
import { UI_CONFIG } from '@/constants/performance';
import {
  SPATIAL_INDEX_CELL_SIZE_METERS,
  SPATIAL_INDEX_LINEAR_THRESHOLD,
  HEATMAP_VARIATION_THRESHOLD,
} from '../config/constants';

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
  const cellSizeDegrees = SPATIAL_INDEX_CELL_SIZE_METERS / METERS_PER_DEGREE_LAT;
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
  if (heatmapPoints.length < SPATIAL_INDEX_LINEAR_THRESHOLD) {
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
function getScoreForLocation(
  lat: number,
  lng: number,
  heatmapPoints: HeatmapPoint[],
  gridCellSize: number
): number | null {
  const searchRadius = gridCellSize * UI_CONFIG.SEARCH_RADIUS_MULTIPLIER;
  const nearestPoint = findNearestHeatmapPoint(lat, lng, heatmapPoints, searchRadius);
  return nearestPoint ? nearestPoint.value : null;
}

/**
 * Convert quality percentage (0-100, higher is better) to K value (0-1, lower is better)
 */
function qualityToKValue(quality: number): number {
  return 1 - (quality / 100);
}

/**
 * Generic filter function for items with geographic coordinates based on heatmap score.
 * Only returns items whose score falls within the specified quality range.
 * 
 * @param items - Array of items with lat/lng coordinates to filter
 * @param heatmapPoints - Array of heatmap points with scores
 * @param qualityRange - [min, max] quality range (0-100, where 100 is best)
 * @param gridCellSize - Grid cell size in meters
 * @returns Filtered array of items
 */
function filterByScore<T extends GeoLocated>(
  items: T[],
  heatmapPoints: HeatmapPoint[],
  qualityRange: [number, number],
  gridCellSize: number
): T[] {
  // If no heatmap data, return all items
  if (!heatmapPoints || heatmapPoints.length === 0) {
    return items;
  }

  // If full range selected, return all items
  if (qualityRange[0] === 0 && qualityRange[1] === 100) {
    return items;
  }

  // Convert quality range to K value range (inverted)
  const kValueMax = qualityToKValue(qualityRange[0]); // Low quality = high K value
  const kValueMin = qualityToKValue(qualityRange[1]); // High quality = low K value

  return items.filter((item) => {
    const kValue = getScoreForLocation(
      item.lat,
      item.lng,
      heatmapPoints,
      gridCellSize
    );

    // If no score found for this location, include the item
    if (kValue === null) {
      return true;
    }

    // Check if K value falls within the range
    return kValue >= kValueMin && kValue <= kValueMax;
  });
}

/**
 * Filter properties based on their location's heatmap score.
 * Only returns properties whose score falls within the specified quality range.
 * 
 * Now works with unified property format.
 * 
 * @param properties - Array of properties to filter (unified format)
 * @param heatmapPoints - Array of heatmap points with scores
 * @param qualityRange - [min, max] quality range (0-100, where 100 is best)
 * @param gridCellSize - Grid cell size in meters
 * @returns Filtered array of properties
 */
export function filterPropertiesByScore<T extends UnifiedProperty>(
  properties: T[],
  heatmapPoints: HeatmapPoint[],
  qualityRange: [number, number],
  gridCellSize: number
): T[] {
  return filterByScore(properties, heatmapPoints, qualityRange, gridCellSize);
}

/**
 * Filter property clusters based on their location's heatmap score.
 * Similar to filterPropertiesByScore but for clusters.
 * 
 * Now works with unified cluster format.
 * 
 * @param clusters - Array of property clusters to filter (unified format)
 * @param heatmapPoints - Array of heatmap points with scores
 * @param qualityRange - [min, max] quality range (0-100, where 100 is best)
 * @param gridCellSize - Grid cell size in meters
 * @returns Filtered array of clusters
 */
export function filterClustersByScore(
  clusters: UnifiedCluster[],
  heatmapPoints: HeatmapPoint[],
  qualityRange: [number, number],
  gridCellSize: number
): UnifiedCluster[] {
  return filterByScore(clusters, heatmapPoints, qualityRange, gridCellSize);
}

/**
 * Check if heatmap data has meaningful variation in K values.
 * 
 * When all K values are identical (or nearly identical), the heatmap data
 * is likely invalid (e.g., no POIs in the area). In this case, score-based
 * filtering should be skipped to avoid hiding all properties/clusters.
 * 
 * @param heatmapPoints - Array of heatmap points to check
 * @returns true if heatmap has meaningful variation, false if all values are the same
 */
export function hasHeatmapVariation(heatmapPoints: HeatmapPoint[]): boolean {
  if (heatmapPoints.length === 0) {
    return false;
  }
  const firstK = heatmapPoints[0].value;
  return heatmapPoints.some(p => Math.abs(p.value - firstK) > HEATMAP_VARIATION_THRESHOLD);
}
