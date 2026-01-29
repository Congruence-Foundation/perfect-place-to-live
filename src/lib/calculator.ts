import { Point, POI, HeatmapPoint, Factor, Bounds, DistanceCurve } from '@/types';
import { haversineDistance, SpatialIndex } from './haversine';
import { generateGrid, calculateAdaptiveGridSize } from './grid';

// Density bonus configuration
// Having multiple POIs nearby slightly improves the score
const DENSITY_BONUS_RADIUS = 0.5; // Consider POIs within 50% of maxDistance for density
const DENSITY_BONUS_MAX = 0.15;   // Maximum bonus (15% improvement)
const DENSITY_BONUS_SCALE = 3;    // Number of POIs needed for full bonus

/**
 * Apply a distance curve transformation to normalize distance values
 * Different curves provide different sensitivity to distance changes:
 * - linear: uniform sensitivity across all distances
 * - log: more sensitive to small distances (street-level precision)
 * - exp: sharp drop-off near POI, 2-sigma coverage at maxDistance
 * - power: moderate sensitivity with square root curve
 * 
 * @param sensitivity - Controls curve steepness (0.5-3, default 1)
 *   - For log: higher = more sensitive to small distances
 *   - For exp: higher = sharper drop-off (default 3 gives 95% at maxDistance)
 *   - For power: lower = more sensitive to small distances (default 0.5)
 */
export function applyDistanceCurve(
  distance: number,
  maxDistance: number,
  curve: DistanceCurve,
  sensitivity: number = 1
): number {
  const ratio = Math.min(distance, maxDistance) / maxDistance;
  
  switch (curve) {
    case 'log':
      // Logarithmic - very sensitive to small distances
      // sensitivity controls the base: higher = more sensitive
      // Default sensitivity=1 gives standard log curve
      const logBase = 1 + (Math.E - 1) * sensitivity;
      return Math.log(1 + ratio * (logBase - 1)) / Math.log(logBase);
      
    case 'exp':
      // Exponential decay - sharp drop-off near POI
      // sensitivity controls decay rate: higher = sharper drop-off
      // Default sensitivity=1 gives k=3 (95% at maxDistance)
      const k = 3 * sensitivity;
      return 1 - Math.exp(-k * ratio);
      
    case 'power':
      // Power curve - sensitivity controls exponent
      // Default sensitivity=1 gives n=0.5 (square root)
      // Lower sensitivity = more sensitive to small distances
      const n = 0.5 / sensitivity;
      return Math.pow(ratio, n);
      
    case 'linear':
    default:
      return ratio;
  }
}

/**
 * Normalize K values to the viewport range (percentile normalization)
 * This makes the heatmap show relative differences within the current view,
 * highlighting the best/worst areas even if they're all similar in absolute terms
 */
export function normalizeKValues(points: HeatmapPoint[]): HeatmapPoint[] {
  if (points.length === 0) return points;
  
  let minK = Infinity, maxK = -Infinity;
  for (const p of points) {
    if (p.value < minK) minK = p.value;
    if (p.value > maxK) maxK = p.value;
  }
  
  const range = maxK - minK;
  if (range === 0) return points;
  
  return points.map(p => ({
    ...p,
    value: (p.value - minK) / range
  }));
}

/**
 * Calculate density bonus based on number of nearby POIs
 * Returns a value between 0 and DENSITY_BONUS_MAX
 * More POIs = higher bonus (diminishing returns)
 */
function calculateDensityBonus(
  point: Point,
  pois: POI[],
  maxDistance: number,
  spatialIndex?: SpatialIndex
): number {
  if (pois.length <= 1) return 0;
  
  const searchRadius = maxDistance * DENSITY_BONUS_RADIUS;
  let nearbyCount = 0;
  
  if (spatialIndex) {
    // Use spatial index for efficient counting
    nearbyCount = spatialIndex.countWithinRadius(point, searchRadius);
  } else {
    // Fallback to simple counting
    for (const poi of pois) {
      const dist = haversineDistance(point, { lat: poi.lat, lng: poi.lng });
      if (dist <= searchRadius) {
        nearbyCount++;
      }
    }
  }
  
  // Diminishing returns: bonus = max * (1 - 1/(count/scale + 1))
  // At count=0: bonus=0, at count=scale: bonus=max/2, approaches max asymptotically
  if (nearbyCount <= 1) return 0;
  
  const normalizedCount = (nearbyCount - 1) / DENSITY_BONUS_SCALE;
  const bonus = DENSITY_BONUS_MAX * (1 - 1 / (normalizedCount + 1));
  
  return bonus;
}

/**
 * Calculate the K value for a single point
 * Lower K = better location (closer to positive amenities, farther from negative ones)
 * Weight sign determines polarity: positive = prefer nearby, negative = avoid nearby
 */
export function calculateK(
  point: Point,
  poiData: Map<string, POI[]>,
  factors: Factor[],
  spatialIndexes?: Map<string, SpatialIndex>,
  distanceCurve: DistanceCurve = 'log',
  sensitivity: number = 1
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const factor of factors) {
    if (!factor.enabled || factor.weight === 0) continue;

    const pois = poiData.get(factor.id) || [];
    const isNegative = factor.weight < 0;
    const absWeight = Math.abs(factor.weight);
    const spatialIndex = spatialIndexes?.get(factor.id);
    
    // If no POIs for this factor, treat as "worst case" (max distance)
    if (pois.length === 0) {
      // For positive factors: no POIs = bad (high K contribution = 1)
      // For negative factors: no POIs = good (low K contribution = 0)
      const value = isNegative ? 0 : 1;
      weightedSum += value * absWeight;
      totalWeight += absWeight;
      continue;
    }

    // Find nearest distance using spatial index if available
    let nearestDistance: number;
    if (spatialIndex) {
      nearestDistance = spatialIndex.findNearestDistance(point, factor.maxDistance);
    } else {
      nearestDistance = findNearestDistanceSimple(point, pois);
    }

    // Apply distance curve transformation
    // This converts raw distance to a 0-1 score with configurable sensitivity
    const normalizedDistance = applyDistanceCurve(nearestDistance, factor.maxDistance, distanceCurve, sensitivity);

    // Calculate base K contribution for this factor
    // For positive factors (weight > 0): closer is better, so K contribution = normalizedDistance
    //   - Close (0m) → K contribution = 0 (good)
    //   - Far (maxDistance) → K contribution = 1 (bad)
    // For negative factors (weight < 0): farther is better, so K contribution = 1 - normalizedDistance
    //   - Close (0m) → K contribution = 1 (bad)
    //   - Far (maxDistance) → K contribution = 0 (good)
    let value = isNegative
      ? 1 - normalizedDistance
      : normalizedDistance;

    // Apply density bonus for positive factors only
    // Having multiple grocery stores nearby is better than just one
    // But having multiple industrial areas nearby is NOT better
    if (!isNegative && pois.length > 1) {
      const densityBonus = calculateDensityBonus(point, pois, factor.maxDistance, spatialIndex);
      // Reduce the K value (lower = better) by the density bonus
      value = Math.max(0, value - densityBonus);
    }

    weightedSum += value * absWeight;
    totalWeight += absWeight;
  }

  // Return normalized K value (0-1 range)
  // 0 = excellent location, 1 = poor location
  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

/**
 * Simple nearest distance calculation without spatial index
 */
function findNearestDistanceSimple(point: Point, pois: POI[]): number {
  let minDistance = Infinity;

  for (const poi of pois) {
    const distance = haversineDistance(point, { lat: poi.lat, lng: poi.lng });
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * Calculate heatmap data for a given bounds and factors
 */
export function calculateHeatmap(
  bounds: Bounds,
  poiData: Map<string, POI[]>,
  factors: Factor[],
  gridSize?: number,
  distanceCurve: DistanceCurve = 'log',
  sensitivity: number = 1,
  normalizeToViewport: boolean = false
): HeatmapPoint[] {
  const startTime = performance.now();

  // Calculate adaptive grid size if not provided
  // Use smaller grid for better resolution, but cap the number of points
  const effectiveGridSize = gridSize || calculateAdaptiveGridSize(bounds, 5000, 100, 500);

  // Generate grid points
  const gridPoints = generateGrid(bounds, effectiveGridSize);

  // Build spatial indexes for each factor's POIs
  const spatialIndexes = new Map<string, SpatialIndex>();
  for (const factor of factors) {
    if (factor.enabled && factor.weight !== 0) {
      const pois = poiData.get(factor.id) || [];
      if (pois.length > 0) {
        spatialIndexes.set(factor.id, new SpatialIndex(pois));
      }
    }
  }

  // Calculate K for each grid point
  let heatmapPoints: HeatmapPoint[] = gridPoints.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    value: calculateK(point, poiData, factors, spatialIndexes, distanceCurve, sensitivity),
  }));

  // Apply viewport normalization if enabled
  if (normalizeToViewport) {
    heatmapPoints = normalizeKValues(heatmapPoints);
  }

  // Log K value distribution for debugging (avoid stack overflow with large arrays)
  if (heatmapPoints.length > 0) {
    let minK = Infinity, maxK = -Infinity, sumK = 0;
    for (const p of heatmapPoints) {
      if (p.value < minK) minK = p.value;
      if (p.value > maxK) maxK = p.value;
      sumK += p.value;
    }
    const avgK = sumK / heatmapPoints.length;
    let sumSqDiff = 0;
    for (const p of heatmapPoints) {
      sumSqDiff += Math.pow(p.value - avgK, 2);
    }
    const stdDev = Math.sqrt(sumSqDiff / heatmapPoints.length);
    console.log(`K value stats: min=${minK.toFixed(3)}, max=${maxK.toFixed(3)}, avg=${avgK.toFixed(3)}, stdDev=${stdDev.toFixed(3)} (curve: ${distanceCurve}, sensitivity: ${sensitivity}, normalized: ${normalizeToViewport})`);
  }

  const endTime = performance.now();
  console.log(
    `Calculated ${heatmapPoints.length} heatmap points in ${(endTime - startTime).toFixed(2)}ms (grid: ${effectiveGridSize}m)`
  );

  return heatmapPoints;
}

/**
 * Recalculate K values with new weights (client-side, no POI refetch needed)
 */
export function recalculateWithWeights(
  points: { lat: number; lng: number }[],
  poiData: Map<string, POI[]>,
  factors: Factor[],
  distanceCurve: DistanceCurve = 'log',
  sensitivity: number = 1
): HeatmapPoint[] {
  // Build spatial indexes
  const spatialIndexes = new Map<string, SpatialIndex>();
  for (const factor of factors) {
    if (factor.enabled && factor.weight !== 0) {
      const pois = poiData.get(factor.id) || [];
      if (pois.length > 0) {
        spatialIndexes.set(factor.id, new SpatialIndex(pois));
      }
    }
  }

  return points.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    value: calculateK(point, poiData, factors, spatialIndexes, distanceCurve, sensitivity),
  }));
}

/**
 * Convert K value to heatmap intensity
 * K is 0-1 where lower is better
 * We want to show good areas (low K) as hot (high intensity)
 */
export function kToIntensity(k: number): number {
  // Invert K so that low K = high intensity (good areas are "hot")
  return 1 - k;
}

/**
 * Get color for K value (for legend/display)
 */
export function getKColor(k: number): string {
  // Green (good) to Red (bad)
  if (k < 0.2) return '#22c55e'; // green-500
  if (k < 0.4) return '#84cc16'; // lime-500
  if (k < 0.6) return '#eab308'; // yellow-500
  if (k < 0.8) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

/**
 * Get label for K value range
 */
export function getKLabel(k: number): string {
  if (k < 0.2) return 'Excellent';
  if (k < 0.4) return 'Good';
  if (k < 0.6) return 'Average';
  if (k < 0.8) return 'Below Average';
  return 'Poor';
}
