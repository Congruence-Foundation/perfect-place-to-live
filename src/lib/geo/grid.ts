import type { Bounds, Point } from '@/types';
import { METERS_PER_DEGREE_LAT } from './constants';
import { metersPerDegreeLng } from './distance';
import { latLngToTile } from './tiles';
import { PERFORMANCE_CONFIG, POI_TILE_CONFIG } from '@/constants/performance';

const { TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE } = PERFORMANCE_CONFIG;

/**
 * Divisor for tile-based grid size calculations.
 * When calculating grid cell size from tile dimensions, we divide the target
 * grid points by this value to account for the fact that a typical viewport
 * spans multiple tiles. A value of 4 assumes ~4 tiles visible in a typical
 * viewport, so each tile gets ~1/4 of the target grid points.
 */
const TILE_GRID_DIVISOR = 4;

/**
 * Calculate grid size for tile-based heatmap calculations
 * Uses a fixed formula based on tile size and target grid points
 * @param tileSizeMeters - The tile size in meters (defaults to POI_TILE_CONFIG.TILE_SIZE_METERS)
 * @param targetPoints - Target number of grid points (defaults to TARGET_GRID_POINTS)
 * @param minCellSize - Minimum cell size in meters (defaults to MIN_CELL_SIZE)
 * @param maxCellSize - Maximum cell size in meters (defaults to MAX_CELL_SIZE)
 */
export function calculateTileGridSize(
  tileSizeMeters: number = POI_TILE_CONFIG.TILE_SIZE_METERS,
  targetPoints: number = TARGET_GRID_POINTS,
  minCellSize: number = MIN_CELL_SIZE,
  maxCellSize: number = MAX_CELL_SIZE
): number {
  return Math.max(
    minCellSize,
    Math.min(maxCellSize, tileSizeMeters / Math.sqrt(targetPoints / TILE_GRID_DIVISOR))
  );
}

/**
 * Generate a grid of sample points within the given bounds
 * Grid points are aligned to a global reference (0,0) to ensure
 * adjacent tiles have matching grid points at boundaries.
 * @param bounds - The geographic bounds to cover
 * @param cellSize - The distance between grid points in meters
 * @returns Array of points forming the grid
 */
export function generateGrid(bounds: Bounds, cellSize: number): Point[] {
  const points: Point[] = [];

  // Handle edge cases: invalid cell size
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    console.warn('Invalid cell size for grid generation:', cellSize);
    return points;
  }

  // Handle edge cases: invalid or degenerate bounds
  if (bounds.north <= bounds.south || bounds.east <= bounds.west) {
    console.warn('Invalid bounds for grid generation: degenerate or inverted bounds');
    return points;
  }

  // Calculate step sizes in degrees
  const centerLat = (bounds.north + bounds.south) / 2;
  const latStep = cellSize / METERS_PER_DEGREE_LAT;
  const lngStep = cellSize / metersPerDegreeLng(centerLat);

  // Guard against extremely small steps that could cause infinite loops
  if (latStep < 1e-10 || lngStep < 1e-10) {
    console.warn('Cell size too small for grid generation');
    return points;
  }

  // Align grid to global reference (0,0) to ensure adjacent tiles have matching points
  // Find the first grid point >= bounds.south that aligns with global grid
  const startLat = Math.ceil(bounds.south / latStep) * latStep;
  const startLng = Math.ceil(bounds.west / lngStep) * lngStep;

  // Generate grid points
  for (let lat = startLat; lat <= bounds.north; lat += latStep) {
    for (let lng = startLng; lng <= bounds.east; lng += lngStep) {
      points.push({ lat, lng });
    }
  }

  return points;
}

/**
 * Estimate the number of grid points for given bounds and cell size
 */
export function estimateGridSize(bounds: Bounds, cellSize: number): number {
  // Handle edge cases
  if (!Number.isFinite(cellSize) || cellSize <= 0) return 0;
  if (bounds.north <= bounds.south || bounds.east <= bounds.west) return 0;

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
  // Handle edge cases: invalid target points
  if (!Number.isFinite(targetPoints) || targetPoints <= 0) {
    return maxCellSize;
  }

  // Handle edge cases: degenerate bounds
  if (bounds.north <= bounds.south || bounds.east <= bounds.west) {
    return maxCellSize;
  }

  const centerLat = (bounds.north + bounds.south) / 2;

  const latRange = (bounds.north - bounds.south) * METERS_PER_DEGREE_LAT;
  const lngRange = (bounds.east - bounds.west) * metersPerDegreeLng(centerLat);

  const area = latRange * lngRange;
  
  // Handle edge case: zero or negative area
  if (area <= 0) {
    return maxCellSize;
  }
  
  const cellSize = Math.sqrt(area / targetPoints);

  return Math.max(minCellSize, Math.min(maxCellSize, cellSize));
}

/**
 * Convert tile coordinates to geographic bounds
 */
export function tileToBounds(z: number, x: number, y: number): Bounds {
  const numTiles = Math.pow(2, z);
  const n = Math.PI - (2 * Math.PI * y) / numTiles;
  const nNext = n - (2 * Math.PI) / numTiles;

  const north = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  const south = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nNext) - Math.exp(-nNext)));

  const west = (x / numTiles) * 360 - 180;
  const east = ((x + 1) / numTiles) * 360 - 180;

  return { north, south, east, west };
}

/**
 * Get all tile coordinates that cover the given bounds at a specific zoom level
 */
export function getTilesForBounds(bounds: Bounds, z: number): { x: number; y: number; z: number }[] {
  const tiles: { x: number; y: number; z: number }[] = [];

  const topLeft = latLngToTile(bounds.north, bounds.west, z);
  const bottomRight = latLngToTile(bounds.south, bounds.east, z);

  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z });
    }
  }

  return tiles;
}
