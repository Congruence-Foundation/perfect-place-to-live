import type { Point, POI } from '@/types';
import { EARTH_RADIUS_METERS, METERS_PER_DEGREE_LAT, DEG_TO_RAD } from './constants';
import { SPATIAL_INDEX_CONFIG } from '@/constants/performance';

/**
 * Calculate the Haversine distance between two points in meters
 */
export function haversineDistance(p1: Point, p2: Point): number {
  const dLat = (p2.lat - p1.lat) * DEG_TO_RAD;
  const dLng = (p2.lng - p1.lng) * DEG_TO_RAD;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * DEG_TO_RAD) * Math.cos(p2.lat * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Interface for items that have geographic coordinates
 */
export interface GeoLocated {
  lat: number;
  lng: number;
}

/** Distance function type for spatial index */
type DistanceFunction<T extends GeoLocated> = (p1: Point, p2: T) => number;

/**
 * Generic grid-based spatial index for faster nearest neighbor queries.
 * Works with any type that has lat/lng coordinates.
 * 
 * @typeParam T - Type of items to index, must have lat and lng properties
 */
export class GenericSpatialIndex<T extends GeoLocated> {
  private cells: Map<string, T[]> = new Map();
  private cellSize: number;
  private distanceFn: DistanceFunction<T>;

  /**
   * Create a new spatial index
   * @param items - Array of items to index
   * @param distanceFn - Function to calculate distance between a point and an item
   * @param cellSizeDegrees - Size of grid cells in degrees (default: 0.01 ≈ 1km)
   */
  constructor(
    items: T[],
    distanceFn: DistanceFunction<T>,
    cellSizeDegrees: number = SPATIAL_INDEX_CONFIG.DEFAULT_CELL_SIZE_DEGREES
  ) {
    this.cellSize = cellSizeDegrees;
    this.distanceFn = distanceFn;
    this.buildIndex(items);
  }

  private getCellKey(lat: number, lng: number): string {
    const cellLat = Math.floor(lat / this.cellSize);
    const cellLng = Math.floor(lng / this.cellSize);
    return `${cellLat},${cellLng}`;
  }

  private buildIndex(items: T[]): void {
    for (const item of items) {
      const key = this.getCellKey(item.lat, item.lng);
      const cell = this.cells.get(key) || [];
      cell.push(item);
      this.cells.set(key, cell);
    }
  }

  /**
   * Find nearest item using spatial index
   * Searches in expanding rings of cells until an item is found
   */
  findNearest(point: Point, maxDistance: number): { item: T; distance: number } | null {
    const centerCellLat = Math.floor(point.lat / this.cellSize);
    const centerCellLng = Math.floor(point.lng / this.cellSize);

    // Convert max distance to approximate cell radius
    const maxCellRadius = Math.ceil(maxDistance / (this.cellSize * METERS_PER_DEGREE_LAT)) + 1;

    let nearestItem: T | null = null;
    let minDistance = Infinity;

    // Search in expanding rings
    for (let radius = 0; radius <= maxCellRadius; radius++) {
      // If we found an item and the current ring is beyond the minimum distance, stop
      if (nearestItem && radius * this.cellSize * METERS_PER_DEGREE_LAT > minDistance) {
        break;
      }

      // Search all cells at this radius
      for (let dLat = -radius; dLat <= radius; dLat++) {
        for (let dLng = -radius; dLng <= radius; dLng++) {
          // Only check cells on the ring perimeter (or all cells for radius 0)
          if (radius > 0 && Math.abs(dLat) !== radius && Math.abs(dLng) !== radius) {
            continue;
          }

          const key = `${centerCellLat + dLat},${centerCellLng + dLng}`;
          const cellItems = this.cells.get(key);

          if (cellItems) {
            for (const item of cellItems) {
              const distance = this.distanceFn(point, item);
              if (distance < minDistance && distance <= maxDistance) {
                minDistance = distance;
                nearestItem = item;
              }
            }
          }
        }
      }
    }

    return nearestItem ? { item: nearestItem, distance: minDistance } : null;
  }

  /**
   * Find distance to nearest item using spatial index
   */
  findNearestDistance(point: Point, maxDistance: number): number {
    const result = this.findNearest(point, maxDistance);
    return result ? result.distance : Infinity;
  }

  /**
   * Count items within a given radius using spatial index
   */
  countWithinRadius(point: Point, radius: number): number {
    const centerCellLat = Math.floor(point.lat / this.cellSize);
    const centerCellLng = Math.floor(point.lng / this.cellSize);

    // Convert radius to approximate cell radius
    const cellRadius = Math.ceil(radius / (this.cellSize * METERS_PER_DEGREE_LAT)) + 1;

    let count = 0;

    // Search all cells within the radius
    for (let dLat = -cellRadius; dLat <= cellRadius; dLat++) {
      for (let dLng = -cellRadius; dLng <= cellRadius; dLng++) {
        const key = `${centerCellLat + dLat},${centerCellLng + dLng}`;
        const cellItems = this.cells.get(key);

        if (cellItems) {
          for (const item of cellItems) {
            const distance = this.distanceFn(point, item);
            if (distance <= radius) {
              count++;
            }
          }
        }
      }
    }

    return count;
  }
}

/**
 * POI-specific spatial index using haversine distance
 * This is a convenience class that wraps GenericSpatialIndex for POI types
 */
export class SpatialIndex extends GenericSpatialIndex<POI> {
  constructor(pois: POI[], cellSizeDegrees: number = SPATIAL_INDEX_CONFIG.DEFAULT_CELL_SIZE_DEGREES) {
    super(pois, (p1, p2) => haversineDistance(p1, p2), cellSizeDegrees);
  }
}
