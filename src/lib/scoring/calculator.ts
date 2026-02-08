import type { Point, POI, HeatmapPoint, Factor, Bounds, DistanceCurve } from '@/types';
import { haversineDistance, SpatialIndex } from '@/lib/geo/haversine';
import { generateGrid, calculateAdaptiveGridSize } from '@/lib/geo/grid';
import { PERFORMANCE_CONFIG, DENSITY_BONUS, POWER_MEAN_CONFIG } from '@/constants';
import { createTimer } from '@/lib/profiling';

const { TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE } = PERFORMANCE_CONFIG;

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
 * Log K value statistics to console for debugging
 * @param points - Heatmap points to analyze
 * @param context - Optional context string to include in log message
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
 * Sensitivity bounds for distance curve calculations
 * Prevents division by zero and extreme values
 */
const SENSITIVITY_MIN = 0.1;
const SENSITIVITY_MAX = 10;

/**
 * Clamp sensitivity to safe bounds [0.1, 10]
 */
function clampSensitivity(sensitivity: number): number {
  return Math.max(SENSITIVITY_MIN, Math.min(SENSITIVITY_MAX, sensitivity));
}

/**
 * Distance curve functions
 * Each transforms a distance ratio (0-1) to a score (0-1) with different sensitivity:
 * - linear: uniform sensitivity across all distances
 * - log: more sensitive to small distances (street-level precision)
 * - exp: sharp drop-off near POI, 2-sigma coverage at maxDistance
 * - power: moderate sensitivity with square root curve
 * 
 * Note: sensitivity is clamped to [0.1, 10] to prevent division by zero and extreme values
 */
type DistanceCurveFn = (ratio: number, sensitivity: number) => number;

const DISTANCE_CURVES: Record<DistanceCurve, DistanceCurveFn> = {
  linear: (ratio) => ratio,
  
  // Logarithmic - sensitivity controls curve steepness via log base
  log: (ratio, sensitivity) => {
    const safeSensitivity = clampSensitivity(sensitivity);
    const logBase = 1 + (Math.E - 1) * safeSensitivity;
    return Math.log(1 + ratio * (logBase - 1)) / Math.log(logBase);
  },
  
  // Exponential decay - sensitivity controls decay rate (default k=3 gives 95% at maxDistance)
  exp: (ratio, sensitivity) => {
    const safeSensitivity = clampSensitivity(sensitivity);
    const k = 3 * safeSensitivity;
    return 1 - Math.exp(-k * ratio);
  },
  
  // Power curve - sensitivity controls exponent (default n=0.5 is square root)
  power: (ratio, sensitivity) => {
    const safeSensitivity = clampSensitivity(sensitivity);
    const n = 0.5 / safeSensitivity;
    return Math.pow(ratio, n);
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
  const curveFn = DISTANCE_CURVES[curve] || DISTANCE_CURVES.linear;
  return curveFn(ratio, sensitivity);
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
 * Returns a value between 0 and DENSITY_BONUS.MAX
 * More POIs = higher bonus (diminishing returns)
 */
function calculateDensityBonus(
  point: Point,
  pois: POI[],
  maxDistance: number,
  spatialIndex?: SpatialIndex
): number {
  if (pois.length <= 1) return 0;
  
  const searchRadius = maxDistance * DENSITY_BONUS.RADIUS_RATIO;
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
  
  const normalizedCount = (nearbyCount - 1) / DENSITY_BONUS.SCALE;
  const bonus = DENSITY_BONUS.MAX * (1 - 1 / (normalizedCount + 1));
  
  return bonus;
}

/**
 * Calculate the K value for a single point using weight-dependent power mean
 * Lower K = better location (closer to positive amenities, farther from negative ones)
 * Weight sign determines polarity: positive = prefer nearby, negative = avoid nearby
 * 
 * The power mean formula: K = (Σ|w|×v^p / Σ|w|)^(1/p̄)
 * Where p = 1 + λ×(|w|/100)² varies per factor based on weight magnitude
 * 
 * @param lambda - Asymmetry strength parameter:
 *   - λ < 0: Low-weight factors gain importance (equalizer mode)
 *   - λ = 0: Standard arithmetic mean (current behavior)
 *   - λ > 0: High-weight factors dominate (critical factors mode)
 */
function calculateK(
  point: Point,
  poiData: Map<string, POI[]>,
  factors: Factor[],
  spatialIndexes?: Map<string, SpatialIndex>,
  distanceCurve: DistanceCurve = 'log',
  sensitivity: number = 1,
  lambda: number = POWER_MEAN_CONFIG.DEFAULT_LAMBDA
): number {
  let powerSum = 0;
  let totalWeight = 0;
  let weightedExponentSum = 0;

  for (const factor of factors) {
    if (!factor.enabled || factor.weight === 0) continue;

    const pois = poiData.get(factor.id) || [];
    const isNegative = factor.weight < 0;
    const absWeight = Math.abs(factor.weight);
    const spatialIndex = spatialIndexes?.get(factor.id);
    
    // Calculate weight-dependent exponent: p = 1 + λ × (|w|/100)²
    const wNorm = absWeight / 100;
    const p = 1 + lambda * wNorm * wNorm;
    
    // If no POIs for this factor, treat as "worst case" (max distance)
    let value: number;
    if (pois.length === 0) {
      // For positive factors: no POIs = bad (high K contribution = 1)
      // For negative factors: no POIs = good (low K contribution = 0)
      value = isNegative ? 0 : 1;
    } else {
      // Find nearest distance using spatial index if available
      let nearestDistance: number;
      if (spatialIndex) {
        nearestDistance = spatialIndex.findNearestDistance(point, factor.maxDistance);
      } else {
        nearestDistance = findNearestDistanceSimple(point, pois);
      }

      // Apply distance curve transformation
      const normalizedDistance = applyDistanceCurve(nearestDistance, factor.maxDistance, distanceCurve, sensitivity);

      // Calculate base K contribution for this factor
      // For positive factors (weight > 0): closer is better, so K contribution = normalizedDistance
      // For negative factors (weight < 0): farther is better, so K contribution = 1 - normalizedDistance
      value = isNegative
        ? 1 - normalizedDistance
        : normalizedDistance;

      // Apply density bonus for positive factors only
      if (!isNegative && pois.length > 1) {
        const densityBonus = calculateDensityBonus(point, pois, factor.maxDistance, spatialIndex);
        value = Math.max(0, value - densityBonus);
      }
    }

    // Accumulate for power mean
    // Use small epsilon to avoid 0^p issues when p < 1
    const safeValue = Math.max(value, 1e-10);
    powerSum += absWeight * Math.pow(safeValue, p);
    totalWeight += absWeight;
    weightedExponentSum += absWeight * p;
  }

  // Return normalized K value (0-1 range)
  if (totalWeight === 0) return 0.5;
  
  // Weighted average exponent
  const pBar = weightedExponentSum / totalWeight;
  
  // Power mean formula: K = (powerSum / totalWeight)^(1/pBar)
  // When lambda=0, pBar=1 for all factors, reducing to arithmetic mean
  const K = Math.pow(powerSum / totalWeight, 1 / pBar);
  
  // Clamp to [0, 1] to handle edge cases
  return Math.min(1, Math.max(0, K));
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
 * Build spatial indexes for POI data
 * Can be called once and shared across multiple calculateHeatmap calls
 */
export function buildSpatialIndexes(
  poiData: Map<string, POI[]>,
  factors: Factor[]
): Map<string, SpatialIndex> {
  const spatialIndexes = new Map<string, SpatialIndex>();
  for (const factor of factors) {
    if (factor.enabled && factor.weight !== 0) {
      const pois = poiData.get(factor.id) || [];
      if (pois.length > 0) {
        spatialIndexes.set(factor.id, new SpatialIndex(pois));
      }
    }
  }
  return spatialIndexes;
}

/**
 * Calculate heatmap data for a given bounds and factors
 * 
 * @param bounds - Geographic bounds to calculate heatmap for
 * @param poiData - Map of factor ID to POI array
 * @param factors - Array of factors with weights and settings
 * @param gridSize - Optional grid cell size in meters (auto-calculated if not provided)
 * @param distanceCurve - Distance curve type for score calculation (default: 'log')
 * @param sensitivity - Curve sensitivity parameter (default: 1)
 * @param lambda - Power mean asymmetry strength (default: 1.0)
 * @param normalizeToViewport - Whether to normalize K values to viewport range
 * @param prebuiltSpatialIndexes - Optional pre-built spatial indexes to avoid rebuilding
 * @returns Array of heatmap points with lat, lng, and value (K score)
 */
export function calculateHeatmap(
  bounds: Bounds,
  poiData: Map<string, POI[]>,
  factors: Factor[],
  gridSize?: number,
  distanceCurve: DistanceCurve = 'log',
  sensitivity: number = 1,
  lambda: number = POWER_MEAN_CONFIG.DEFAULT_LAMBDA,
  normalizeToViewport: boolean = false,
  prebuiltSpatialIndexes?: Map<string, SpatialIndex>
): HeatmapPoint[] {
  const stopTimer = createTimer('calculator:total');

  // Calculate adaptive grid size if not provided
  const effectiveGridSize = gridSize || calculateAdaptiveGridSize(bounds, TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE);

  // Generate grid points
  const gridPoints = generateGrid(bounds, effectiveGridSize);

  // Use pre-built spatial indexes if provided, otherwise build them
  const spatialIndexes = prebuiltSpatialIndexes || buildSpatialIndexes(poiData, factors);

  // Calculate K for each grid point
  let heatmapPoints: HeatmapPoint[] = gridPoints.map((point) => ({
    lat: point.lat,
    lng: point.lng,
    value: calculateK(point, poiData, factors, spatialIndexes, distanceCurve, sensitivity, lambda),
  }));

  // Apply viewport normalization if enabled
  if (normalizeToViewport) {
    heatmapPoints = normalizeKValues(heatmapPoints);
  }

  // Log K value distribution for debugging
  logKStats(heatmapPoints, `curve: ${distanceCurve}, sensitivity: ${sensitivity}, lambda: ${lambda}, normalized: ${normalizeToViewport}`);

  stopTimer({ points: heatmapPoints.length, gridSize: effectiveGridSize });

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
  score: number; // 0-1, lower is better (uses linear normalization for display clarity)
  isNegative: boolean; // derived from weight sign
  weight: number;
  contribution: number; // weighted contribution to final K
  effectiveExponent: number; // p = 1 + λ×(|w|/100)² for this factor
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
 * Note: This function uses linear distance normalization for the score field
 * to provide intuitive, easy-to-understand values in the UI. The actual K value
 * calculation uses the configurable distance curve (log/exp/power) which may
 * produce different results. The K value returned here is calculated using
 * the power mean formula with the specified lambda.
 * 
 * @param lat - Latitude of the location
 * @param lng - Longitude of the location
 * @param factors - Array of factors to analyze
 * @param pois - POI data keyed by factor ID
 * @param lambda - Power mean asymmetry strength (default: 1.0)
 * @returns K value and detailed breakdown by factor
 */
export function calculateFactorBreakdown(
  lat: number,
  lng: number,
  factors: Factor[],
  pois: Record<string, POI[]>,
  lambda: number = POWER_MEAN_CONFIG.DEFAULT_LAMBDA
): FactorBreakdownResult {
  const breakdown: FactorBreakdown[] = [];
  let powerSum = 0;
  let totalWeight = 0;
  let weightedExponentSum = 0;
  const point = { lat, lng };

  for (const factor of factors) {
    if (!factor.enabled || factor.weight === 0) continue;

    const factorPOIs = pois[factor.id] || [];
    const isNegative = factor.weight < 0;
    const absWeight = Math.abs(factor.weight);
    
    // Calculate weight-dependent exponent
    const wNorm = absWeight / 100;
    const p = 1 + lambda * wNorm * wNorm;
    
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

    // Power mean contribution
    const safeScore = Math.max(score, 1e-10);
    const powerContribution = absWeight * Math.pow(safeScore, p);
    powerSum += powerContribution;
    totalWeight += absWeight;
    weightedExponentSum += absWeight * p;

    breakdown.push({
      factorId: factor.id,
      factorName: factor.name,
      distance: nearestDistance,
      maxDistance: factor.maxDistance,
      score,
      isNegative,
      weight: factor.weight,
      contribution: powerContribution,
      effectiveExponent: p,
      noPOIs,
      nearbyCount,
    });
  }

  // Calculate K using power mean
  let k = 0.5;
  if (totalWeight > 0) {
    const pBar = weightedExponentSum / totalWeight;
    k = Math.pow(powerSum / totalWeight, 1 / pBar);
    k = Math.min(1, Math.max(0, k));
  }
  
  // Sort by contribution (highest impact first)
  breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { k, breakdown };
}
