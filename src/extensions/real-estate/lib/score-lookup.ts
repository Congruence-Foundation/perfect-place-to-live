import type { HeatmapPoint } from '@/types/heatmap';
import type { OtodomProperty, PropertyCluster } from '../types/property';
import { distanceInMeters } from '@/lib/geo';
import { UI_CONFIG } from '@/constants/performance';

/**
 * Interface for items that have geographic coordinates
 */
interface GeoLocated {
  lat: number;
  lng: number;
}

/**
 * Find the nearest heatmap point to a given location within a search radius.
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
 * @param properties - Array of properties to filter
 * @param heatmapPoints - Array of heatmap points with scores
 * @param qualityRange - [min, max] quality range (0-100, where 100 is best)
 * @param gridCellSize - Grid cell size in meters
 * @returns Filtered array of properties
 */
export function filterPropertiesByScore(
  properties: OtodomProperty[],
  heatmapPoints: HeatmapPoint[],
  qualityRange: [number, number],
  gridCellSize: number
): OtodomProperty[] {
  return filterByScore(properties, heatmapPoints, qualityRange, gridCellSize);
}

/**
 * Filter property clusters based on their location's heatmap score.
 * Similar to filterPropertiesByScore but for clusters.
 * 
 * @param clusters - Array of property clusters to filter
 * @param heatmapPoints - Array of heatmap points with scores
 * @param qualityRange - [min, max] quality range (0-100, where 100 is best)
 * @param gridCellSize - Grid cell size in meters
 * @returns Filtered array of clusters
 */
export function filterClustersByScore(
  clusters: PropertyCluster[],
  heatmapPoints: HeatmapPoint[],
  qualityRange: [number, number],
  gridCellSize: number
): PropertyCluster[] {
  return filterByScore(clusters, heatmapPoints, qualityRange, gridCellSize);
}
