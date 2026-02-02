/**
 * Parallel heatmap calculator using worker threads
 * Distributes grid point calculations across multiple CPU cores
 * 
 * Performance notes:
 * - Provides ~2x speedup for large grids (>10k points)
 * - Worker spawn overhead makes it slower for small grids
 * - Falls back to single-threaded for grids < 10k points
 */

import { Worker } from 'worker_threads';
import * as os from 'os';
import type { Point, POI, HeatmapPoint, Factor, Bounds, DistanceCurve } from '@/types';
import { generateGrid, calculateAdaptiveGridSize } from '@/lib/geo/grid';
import { normalizeKValues, logKStats } from './calculator';
import { PERFORMANCE_CONFIG } from '@/constants';
import { createTimer } from '@/lib/profiling';

const { TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE } = PERFORMANCE_CONFIG;

// Use available CPU cores, but cap at 8 to avoid diminishing returns
const MAX_WORKERS = Math.min(os.cpus().length, 8);
// Minimum points per worker to justify overhead
const MIN_POINTS_PER_WORKER = 3000;
// Minimum total points to use parallel processing (below this, single-threaded is faster)
const MIN_POINTS_FOR_PARALLEL = 10000;

/**
 * Split array into n roughly equal chunks
 */
function chunkArray<T>(array: T[], numChunks: number): T[][] {
  const chunks: T[][] = [];
  const chunkSize = Math.ceil(array.length / numChunks);

  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }

  return chunks;
}

/**
 * Worker code as a string - this gets executed in each worker thread
 * We inline it to avoid TypeScript compilation issues
 * 
 * OPTIMIZED: Receives pre-built spatial index data to avoid rebuilding
 * 
 * IMPORTANT: Code Duplication Notice
 * ----------------------------------
 * The following code is intentionally duplicated here because worker threads
 * run in isolated contexts and cannot import from other modules:
 * 
 * - haversineDistance() - duplicated from src/lib/geo/haversine.ts
 * - SpatialIndex class - duplicated from src/lib/geo/haversine.ts
 * - applyDistanceCurve() - duplicated from src/lib/scoring/calculator.ts
 * - calculateDensityBonus() - duplicated from src/lib/scoring/calculator.ts
 * 
 * Constants that must stay in sync:
 * - EARTH_RADIUS_METERS (6371000) - from src/lib/geo/constants.ts
 * - DENSITY_BONUS_* constants - from src/constants/performance.ts
 * - Magic number 111320 (meters per degree lat) - from src/lib/geo/constants.ts METERS_PER_DEGREE_LAT
 * 
 * When modifying any of these source files, remember to update this worker code!
 */
const WORKER_CODE = `
const { parentPort, workerData } = require('worker_threads');

// These constants must match src/constants/performance.ts DENSITY_BONUS
const EARTH_RADIUS_METERS = 6371000;
const DENSITY_BONUS_RADIUS_RATIO = 0.5;
const DENSITY_BONUS_MAX = 0.15;
const DENSITY_BONUS_SCALE = 3;

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

function haversineDistance(p1, p2) {
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Optimized spatial index that uses pre-built cell data
class SpatialIndex {
  constructor(cellsData, cellSize) {
    this.cells = new Map(cellsData);
    this.cellSize = cellSize;
  }

  findNearestDistance(point, maxDistance) {
    const centerCellLat = Math.floor(point.lat / this.cellSize);
    const centerCellLng = Math.floor(point.lng / this.cellSize);
    const maxCellRadius = Math.ceil(maxDistance / (this.cellSize * 111320)) + 1;
    let minDistance = Infinity;

    for (let radius = 0; radius <= maxCellRadius; radius++) {
      if (minDistance < Infinity && radius * this.cellSize * 111320 > minDistance) break;

      for (let dLat = -radius; dLat <= radius; dLat++) {
        for (let dLng = -radius; dLng <= radius; dLng++) {
          if (radius > 0 && Math.abs(dLat) !== radius && Math.abs(dLng) !== radius) continue;

          const key = (centerCellLat + dLat) + ',' + (centerCellLng + dLng);
          const cellPOIs = this.cells.get(key);

          if (cellPOIs) {
            for (const poi of cellPOIs) {
              const distance = haversineDistance(point, poi);
              if (distance < minDistance && distance <= maxDistance) {
                minDistance = distance;
              }
            }
          }
        }
      }
    }
    return minDistance;
  }

  countWithinRadius(point, radius) {
    const centerCellLat = Math.floor(point.lat / this.cellSize);
    const centerCellLng = Math.floor(point.lng / this.cellSize);
    const cellRadius = Math.ceil(radius / (this.cellSize * 111320)) + 1;
    let count = 0;

    for (let dLat = -cellRadius; dLat <= cellRadius; dLat++) {
      for (let dLng = -cellRadius; dLng <= cellRadius; dLng++) {
        const key = (centerCellLat + dLat) + ',' + (centerCellLng + dLng);
        const cellPOIs = this.cells.get(key);
        if (cellPOIs) {
          for (const poi of cellPOIs) {
            if (haversineDistance(point, poi) <= radius) count++;
          }
        }
      }
    }
    return count;
  }
}

function applyDistanceCurve(distance, maxDistance, curve, sensitivity) {
  const ratio = Math.min(distance, maxDistance) / maxDistance;
  switch (curve) {
    case 'log':
      const logBase = 1 + (Math.E - 1) * sensitivity;
      return Math.log(1 + ratio * (logBase - 1)) / Math.log(logBase);
    case 'exp':
      return 1 - Math.exp(-3 * sensitivity * ratio);
    case 'power':
      return Math.pow(ratio, 0.5 / sensitivity);
    default:
      return ratio;
  }
}

function calculateK(point, poiData, factors, spatialIndexes, distanceCurve, sensitivity) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const factor of factors) {
    if (!factor.enabled || factor.weight === 0) continue;

    const pois = poiData.get(factor.id) || [];
    const isNegative = factor.weight < 0;
    const absWeight = Math.abs(factor.weight);
    const spatialIndex = spatialIndexes.get(factor.id);

    if (pois.length === 0) {
      weightedSum += (isNegative ? 0 : 1) * absWeight;
      totalWeight += absWeight;
      continue;
    }

    const nearestDistance = spatialIndex 
      ? spatialIndex.findNearestDistance(point, factor.maxDistance)
      : Infinity;

    const normalizedDistance = applyDistanceCurve(nearestDistance, factor.maxDistance, distanceCurve, sensitivity);
    let value = isNegative ? 1 - normalizedDistance : normalizedDistance;

    if (!isNegative && pois.length > 1 && spatialIndex) {
      const searchRadius = factor.maxDistance * DENSITY_BONUS_RADIUS_RATIO;
      const nearbyCount = spatialIndex.countWithinRadius(point, searchRadius);
      if (nearbyCount > 1) {
        const normalizedCount = (nearbyCount - 1) / DENSITY_BONUS_SCALE;
        const bonus = DENSITY_BONUS_MAX * (1 - 1 / (normalizedCount + 1));
        value = Math.max(0, value - bonus);
      }
    }

    weightedSum += value * absWeight;
    totalWeight += absWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

// Main worker execution
const { points, poiData, spatialIndexData, factors, distanceCurve, sensitivity } = workerData;

// Convert POI data to Map
const poiDataMap = new Map(Object.entries(poiData));

// Rebuild spatial indexes from serialized data
const spatialIndexes = new Map();
for (const [factorId, indexData] of Object.entries(spatialIndexData)) {
  spatialIndexes.set(factorId, new SpatialIndex(indexData.cells, indexData.cellSize));
}

// Calculate K for each point
const results = points.map(point => ({
  lat: point.lat,
  lng: point.lng,
  value: calculateK(point, poiDataMap, factors, spatialIndexes, distanceCurve, sensitivity)
}));

parentPort.postMessage(results);
`;

/**
 * Build spatial index and serialize it for worker transfer
 */
function buildSpatialIndexData(pois: POI[], cellSize: number = 0.01): { cells: [string, POI[]][]; cellSize: number } {
  const cells = new Map<string, POI[]>();
  
  for (const poi of pois) {
    const cellLat = Math.floor(poi.lat / cellSize);
    const cellLng = Math.floor(poi.lng / cellSize);
    const key = `${cellLat},${cellLng}`;
    const cell = cells.get(key) || [];
    cell.push(poi);
    cells.set(key, cell);
  }
  
  return {
    cells: Array.from(cells.entries()),
    cellSize
  };
}

/**
 * Run a single worker with the given data
 */
function runWorker(
  points: Point[],
  poiData: Record<string, POI[]>,
  spatialIndexData: Record<string, { cells: [string, POI[]][]; cellSize: number }>,
  factors: Factor[],
  distanceCurve: DistanceCurve,
  sensitivity: number
): Promise<HeatmapPoint[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: {
        points,
        poiData,
        spatialIndexData,
        factors,
        distanceCurve,
        sensitivity,
      },
    });

    worker.on('message', (results: HeatmapPoint[]) => {
      resolve(results);
      worker.terminate();
    });

    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Calculate heatmap in parallel using worker threads
 */
export async function calculateHeatmapParallel(
  bounds: Bounds,
  poiData: Map<string, POI[]>,
  factors: Factor[],
  gridSize?: number,
  distanceCurve: DistanceCurve = 'log',
  sensitivity: number = 1,
  normalizeToViewport: boolean = false
): Promise<HeatmapPoint[]> {
  const startTime = performance.now();
  const stopTotalTimer = createTimer('calculator:total');

  // Calculate adaptive grid size if not provided
  const stopGridTimer = createTimer('calculator:grid-gen');
  const effectiveGridSize =
    gridSize || calculateAdaptiveGridSize(bounds, TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE);

  // Generate grid points
  const gridPoints = generateGrid(bounds, effectiveGridSize);
  stopGridTimer({ gridSize: effectiveGridSize, points: gridPoints.length });

  // Determine number of workers based on workload
  const numWorkers = Math.min(
    MAX_WORKERS,
    Math.max(1, Math.floor(gridPoints.length / MIN_POINTS_PER_WORKER))
  );

  // Convert POI data to plain object for worker transfer
  const poiDataObj: Record<string, POI[]> = {};
  poiData.forEach((pois, factorId) => {
    poiDataObj[factorId] = pois;
  });

  // Filter to enabled factors only
  const enabledFactors = factors.filter((f) => f.enabled && f.weight !== 0);

  let heatmapPoints: HeatmapPoint[];

  if (numWorkers <= 1 || gridPoints.length < MIN_POINTS_FOR_PARALLEL) {
    // Fall back to single-threaded for small workloads
    const { calculateHeatmap } = await import('./calculator');
    heatmapPoints = calculateHeatmap(
      bounds,
      poiData,
      factors,
      gridSize,
      distanceCurve,
      sensitivity,
      normalizeToViewport
    );
    
    const endTime = performance.now();
    console.log(
      `Calculated ${heatmapPoints.length} heatmap points in ${(endTime - startTime).toFixed(2)}ms (single-threaded, grid: ${effectiveGridSize}m)`
    );
    
    stopTotalTimer({ points: heatmapPoints.length, workers: 1, mode: 'single-threaded' });
    return heatmapPoints;
  }

  // Build spatial indexes once in main thread
  const stopIndexTimer = createTimer('calculator:spatial-index');
  const spatialIndexData: Record<string, { cells: [string, POI[]][]; cellSize: number }> = {};
  for (const factor of enabledFactors) {
    const pois = poiDataObj[factor.id] || [];
    if (pois.length > 0) {
      spatialIndexData[factor.id] = buildSpatialIndexData(pois);
    }
  }
  stopIndexTimer({ factors: enabledFactors.length });

  // Split points into chunks for parallel processing
  const pointChunks = chunkArray(gridPoints, numWorkers);

  try {
    // Run workers in parallel
    const stopWorkersTimer = createTimer('calculator:workers');
    const workerPromises = pointChunks.map((chunk) =>
      runWorker(chunk, poiDataObj, spatialIndexData, enabledFactors, distanceCurve, sensitivity)
    );

    const results = await Promise.all(workerPromises);
    stopWorkersTimer({ workers: numWorkers, pointsPerWorker: Math.ceil(gridPoints.length / numWorkers) });

    // Combine results from all workers
    heatmapPoints = results.flat();
  } catch (error) {
    // If workers fail, fall back to single-threaded
    console.warn(
      'Worker execution failed, falling back to single-threaded:',
      error
    );
    const { calculateHeatmap } = await import('./calculator');
    heatmapPoints = calculateHeatmap(
      bounds,
      poiData,
      factors,
      gridSize,
      distanceCurve,
      sensitivity,
      normalizeToViewport
    );

    const endTime = performance.now();
    console.log(
      `Calculated ${heatmapPoints.length} heatmap points in ${(endTime - startTime).toFixed(2)}ms (fallback single-threaded, grid: ${effectiveGridSize}m)`
    );

    stopTotalTimer({ points: heatmapPoints.length, workers: 1, mode: 'fallback-single-threaded' });
    return heatmapPoints;
  }

  // Apply viewport normalization if enabled
  if (normalizeToViewport) {
    heatmapPoints = normalizeKValues(heatmapPoints);
  }

  // Log stats
  logKStats(heatmapPoints, `workers: ${numWorkers}`);

  const endTime = performance.now();
  console.log(
    `Calculated ${heatmapPoints.length} heatmap points in ${(endTime - startTime).toFixed(2)}ms using ${numWorkers} workers (grid: ${effectiveGridSize}m)`
  );

  stopTotalTimer({ points: heatmapPoints.length, workers: numWorkers, mode: 'parallel' });
  return heatmapPoints;
}
