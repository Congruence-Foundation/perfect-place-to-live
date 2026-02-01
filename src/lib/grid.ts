import { Bounds, Point } from '@/types';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng } from './geo';
import { PERFORMANCE_CONFIG } from '@/constants/performance';

const { TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE } = PERFORMANCE_CONFIG;

/**
 * Generate a grid of sample points within the given bounds
 * @param bounds - The geographic bounds to cover
 * @param cellSize - The distance between grid points in meters
 * @returns Array of points forming the grid
 */
export function generateGrid(bounds: Bounds, cellSize: number): Point[] {
  const points: Point[] = [];

  // Calculate step sizes in degrees
  const centerLat = (bounds.north + bounds.south) / 2;
  const latStep = cellSize / METERS_PER_DEGREE_LAT;
  const lngStep = cellSize / metersPerDegreeLng(centerLat);

  // Generate grid points
  for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
    for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
      points.push({ lat, lng });
    }
  }

  return points;
}

/**
 * Estimate the number of grid points for given bounds and cell size
 */
export function estimateGridSize(bounds: Bounds, cellSize: number): number {
  const centerLat = (bounds.north + bounds.south) / 2;

  const latRange = (bounds.north - bounds.south) * METERS_PER_DEGREE_LAT;
  const lngRange = (bounds.east - bounds.west) * metersPerDegreeLng(centerLat);

  const latCells = Math.ceil(latRange / cellSize);
  const lngCells = Math.ceil(lngRange / cellSize);

  return latCells * lngCells;
}

/**
 * Calculate adaptive grid size based on viewport and target point count
 */
export function calculateAdaptiveGridSize(
  bounds: Bounds,
  targetPoints: number = TARGET_GRID_POINTS,
  minCellSize: number = MIN_CELL_SIZE,
  maxCellSize: number = MAX_CELL_SIZE
): number {
  const centerLat = (bounds.north + bounds.south) / 2;

  const latRange = (bounds.north - bounds.south) * METERS_PER_DEGREE_LAT;
  const lngRange = (bounds.east - bounds.west) * metersPerDegreeLng(centerLat);

  const area = latRange * lngRange;
  const cellSize = Math.sqrt(area / targetPoints);

  return Math.max(minCellSize, Math.min(maxCellSize, cellSize));
}

/**
 * Convert tile coordinates to geographic bounds
 */
export function tileToBounds(z: number, x: number, y: number): Bounds {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);

  const north = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  const south =
    (180 / Math.PI) *
    Math.atan(0.5 * (Math.exp(n - (2 * Math.PI) / Math.pow(2, z)) - Math.exp(-(n - (2 * Math.PI) / Math.pow(2, z)))));

  const west = (x / Math.pow(2, z)) * 360 - 180;
  const east = ((x + 1) / Math.pow(2, z)) * 360 - 180;

  return { north, south, east, west };
}

/**
 * Convert geographic coordinates to tile coordinates
 */
function coordsToTile(lat: number, lng: number, z: number): { x: number; y: number } {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, z));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  );

  return { x, y };
}

/**
 * Get all tile coordinates that cover the given bounds at a specific zoom level
 */
export function getTilesForBounds(bounds: Bounds, z: number): { x: number; y: number; z: number }[] {
  const tiles: { x: number; y: number; z: number }[] = [];

  const topLeft = coordsToTile(bounds.north, bounds.west, z);
  const bottomRight = coordsToTile(bounds.south, bounds.east, z);

  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z });
    }
  }

  return tiles;
}
