import { HeatmapPoint } from '@/types/heatmap';
import { OtodomProperty, PropertyCluster } from '@/types/property';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng, distanceInMeters } from './geo';

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
  gridCellSize: number
): number | null {
  if (!heatmapPoints || heatmapPoints.length === 0) {
    return null;
  }

  // Search radius is 1.5x the grid cell size to ensure we find a point
  const searchRadius = gridCellSize * 1.5;
  
  let nearestPoint: HeatmapPoint | null = null;
  let nearestDistance = Infinity;

  for (const point of heatmapPoints) {
    const distance = distanceInMeters(lat, lng, point.lat, point.lng);
    
    if (distance < nearestDistance && distance <= searchRadius) {
      nearestDistance = distance;
      nearestPoint = point;
    }
  }

  return nearestPoint ? nearestPoint.value : null;
}

/**
 * Convert quality percentage (0-100, higher is better) to K value (0-1, lower is better)
 */
export function qualityToKValue(quality: number): number {
  return 1 - (quality / 100);
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
  // If no heatmap data, return all properties
  if (!heatmapPoints || heatmapPoints.length === 0) {
    return properties;
  }

  // If full range selected, return all properties
  if (qualityRange[0] === 0 && qualityRange[1] === 100) {
    return properties;
  }

  // Convert quality range to K value range (inverted)
  const kValueMax = qualityToKValue(qualityRange[0]); // Low quality = high K value
  const kValueMin = qualityToKValue(qualityRange[1]); // High quality = low K value

  return properties.filter((property) => {
    const kValue = getScoreForLocation(
      property.lat,
      property.lng,
      heatmapPoints,
      gridCellSize
    );

    // If no score found for this location, include the property
    if (kValue === null) {
      return true;
    }

    // Check if K value falls within the range
    return kValue >= kValueMin && kValue <= kValueMax;
  });
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
  // If no heatmap data, return all clusters
  if (!heatmapPoints || heatmapPoints.length === 0) {
    return clusters;
  }

  // If full range selected, return all clusters
  if (qualityRange[0] === 0 && qualityRange[1] === 100) {
    return clusters;
  }

  // Convert quality range to K value range (inverted)
  const kValueMax = qualityToKValue(qualityRange[0]);
  const kValueMin = qualityToKValue(qualityRange[1]);

  return clusters.filter((cluster) => {
    const kValue = getScoreForLocation(
      cluster.lat,
      cluster.lng,
      heatmapPoints,
      gridCellSize
    );

    // If no score found for this location, include the cluster
    if (kValue === null) {
      return true;
    }

    // Check if K value falls within the range
    return kValue >= kValueMin && kValue <= kValueMax;
  });
}
