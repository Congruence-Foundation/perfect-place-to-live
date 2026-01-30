import { Point, POI, HeatmapPoint, Factor, Bounds, DistanceCurve } from '@/types';
import { haversineDistance, SpatialIndex } from './haversine';
import { generateGrid, calculateAdaptiveGridSize } from './grid';
import { PERFORMANCE_CONFIG } from '@/constants';

const { TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE } = PERFORMANCE_CONFIG;

// Density bonus configuration
// Having multiple POIs nearby slightly improves the score
const DENSITY_BONUS_RADIUS = 0.5; // Consider POIs within 50% of maxDistance for density
const DENSITY_BONUS_MAX = 0.15;   // Maximum bonus (15% improvement)
const DENSITY_BONUS_SCALE = 3;    // Number of POIs needed for full bonus

/**
 * K value statistics for debugging and analysis
 */
interface KStats {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
}

/**
 * Calculate statistics for K values in heatmap points
 * Used for debugging and understanding score distribution
 */
function calculateKStats(points: HeatmapPoint[]): KStats | null {
  if (points.length === 0) return null;
  
  let minK = Infinity;
  let maxK = -Infinity;
  let sumK = 0;
  
  for (const p of points) {
    if (p.value < minK) minK = p.value;
    if (p.value > maxK) maxK = p.value;
    sumK += p.value;
  }
  
  const avgK = sumK / points.length;
  
  let sumSqDiff = 0;
  for (const p of points) {
    sumSqDiff += Math.pow(p.value - avgK, 2);
  }
  const stdDev = Math.sqrt(sumSqDiff / points.length);
  
  return { min: minK, max: maxK, avg: avgK, stdDev };
}

/**
 * Log K value statistics to console
 * @param points - Heatmap points to analyze
 * @param context - Additional context to include in log message
 */
export function logKStats(points: HeatmapPoint[], context?: string): void {
  const stats = calculateKStats(points);
  if (!stats) return;
  
  const contextStr = context ? ` (${context})` : '';
  console.log(
    `K value stats: min=${stats.min.toFixed(3)}, max=${stats.max.toFixed(3)}, avg=${stats.avg.toFixed(3)}, stdDev=${stats.stdDev.toFixed(3)}${contextStr}`
  );
}

/**
 * Distance curve strategy interface
 * Each strategy transforms a distance ratio (0-1) to a score (0-1)
 */
interface DistanceCurveStrategy {
  /**
   * Apply the distance curve transformation
   * @param ratio - Distance ratio (0 = at POI, 1 = at maxDistance)
   * @param sensitivity - Curve sensitivity parameter
   * @returns Transformed score (0-1)
   */
  apply(ratio: number, sensitivity: number): number;
}

/**
 * Distance curve strategies
 * Each provides different sensitivity to distance changes:
 * - linear: uniform sensitivity across all distances
 * - log: more sensitive to small distances (street-level precision)
 * - exp: sharp drop-off near POI, 2-sigma coverage at maxDistance
 * - power: moderate sensitivity with square root curve
 */
const DISTANCE_CURVE_STRATEGIES: Record<DistanceCurve, DistanceCurveStrategy> = {
  linear: {
    apply: (ratio: number) => ratio,
  },
  log: {
    // Logarithmic - very sensitive to small distances
    // sensitivity controls the base: higher = more sensitive
    apply: (ratio: number, sensitivity: number) => {
      const logBase = 1 + (Math.E - 1) * sensitivity;
      return Math.log(1 + ratio * (logBase - 1)) / Math.log(logBase);
    },
  },
  exp: {
    // Exponential decay - sharp drop-off near POI
    // sensitivity controls decay rate: higher = sharper drop-off
    // Default sensitivity=1 gives k=3 (95% at maxDistance)
    apply: (ratio: number, sensitivity: number) => {
      const k = 3 * sensitivity;
      return 1 - Math.exp(-k * ratio);
    },
  },
  power: {
    // Power curve - sensitivity controls exponent
    // Default sensitivity=1 gives n=0.5 (square root)
    // Lower sensitivity = more sensitive to small distances
    apply: (ratio: number, sensitivity: number) => {
      const n = 0.5 / sensitivity;
      return Math.pow(ratio, n);
    },
  },
};

/**
 * Apply a distance curve transformation to normalize distance values
 * Different curves provide different sensitivity to distance changes
 * 
 * @param distance - Raw distance in meters
 * @param maxDistance - Maximum distance threshold
 * @param curve - The curve type to apply
 * @param sensitivity - Controls curve steepness (0.5-3, default 1)
 * @returns Normalized score (0-1)
 */
function applyDistanceCurve(
  distance: number,
  maxDistance: number,
  curve: DistanceCurve,
  sensitivity: number = 1
): number {
  const ratio = Math.min(distance, maxDistance) / maxDistance;
  const strategy = DISTANCE_CURVE_STRATEGIES[curve] || DISTANCE_CURVE_STRATEGIES.linear;
  return strategy.apply(ratio, sensitivity);
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
  const effectiveGridSize = gridSize || calculateAdaptiveGridSize(bounds, TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE);

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

  // Log K value distribution for debugging
  logKStats(heatmapPoints, `curve: ${distanceCurve}, sensitivity: ${sensitivity}, normalized: ${normalizeToViewport}`);

  const endTime = performance.now();
  console.log(
    `Calculated ${heatmapPoints.length} heatmap points in ${(endTime - startTime).toFixed(2)}ms (grid: ${effectiveGridSize}m)`
  );

  return heatmapPoints;
}

/**
 * Factor breakdown result for a single factor
 * Used for detailed location analysis in popups
 */
export interface FactorBreakdown {
  factorId: string;
  factorName: string;
  distance: number;
  maxDistance: number;
  score: number; // 0-1, lower is better
  isNegative: boolean; // derived from weight sign
  weight: number;
  contribution: number; // weighted contribution to final K
  noPOIs: boolean;
  nearbyCount: number; // count of POIs within maxDistance
}

/**
 * Result of factor breakdown calculation
 */
export interface FactorBreakdownResult {
  k: number;
  breakdown: FactorBreakdown[];
}

/**
 * Calculate detailed factor breakdown for a specific location
 * Used for showing location details in popups
 * 
 * @param lat - Latitude of the location
 * @param lng - Longitude of the location
 * @param factors - Array of factors to analyze
 * @param pois - POI data keyed by factor ID
 * @returns K value and detailed breakdown by factor
 */
export function calculateFactorBreakdown(
  lat: number,
  lng: number,
  factors: Factor[],
  pois: Record<string, POI[]>
): FactorBreakdownResult {
  const breakdown: FactorBreakdown[] = [];
  let weightedSum = 0;
  let totalWeight = 0;
  const point = { lat, lng };

  for (const factor of factors) {
    if (!factor.enabled || factor.weight === 0) continue;

    const factorPOIs = pois[factor.id] || [];
    const isNegative = factor.weight < 0;
    const absWeight = Math.abs(factor.weight);
    
    let nearestDistance = Infinity;
    let noPOIs = false;
    let nearbyCount = 0;

    if (factorPOIs.length === 0) {
      noPOIs = true;
      nearestDistance = factor.maxDistance;
    } else {
      // Find nearest POI and count nearby POIs
      for (const poi of factorPOIs) {
        const dist = haversineDistance(point, { lat: poi.lat, lng: poi.lng });
        if (dist < nearestDistance) {
          nearestDistance = dist;
        }
        // Count POIs within maxDistance
        if (dist <= factor.maxDistance) {
          nearbyCount++;
        }
      }
    }

    const cappedDistance = Math.min(nearestDistance, factor.maxDistance);
    const normalizedDistance = cappedDistance / factor.maxDistance;
    
    // Score: 0 = good, 1 = bad
    let score: number;
    if (noPOIs) {
      score = isNegative ? 0 : 1;
    } else {
      score = isNegative ? (1 - normalizedDistance) : normalizedDistance;
    }

    const contribution = score * absWeight;
    weightedSum += contribution;
    totalWeight += absWeight;

    breakdown.push({
      factorId: factor.id,
      factorName: factor.name,
      distance: nearestDistance,
      maxDistance: factor.maxDistance,
      score,
      isNegative,
      weight: factor.weight,
      contribution,
      noPOIs,
      nearbyCount,
    });
  }

  const k = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  
  // Sort by contribution (highest impact first)
  breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { k, breakdown };
}

