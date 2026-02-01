import type { Point, POI } from '@/types';
import { EARTH_RADIUS_METERS, METERS_PER_DEGREE_LAT } from './constants';
import { toRad } from './distance';

/**
 * Calculate the Haversine distance between two points in meters
 */
export function haversineDistance(p1: Point, p2: Point): number {
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Simple KD-tree-like spatial index for faster nearest neighbor queries
 * This is a simplified version that divides space into grid cells
 */
export class SpatialIndex {
  private cells: Map<string, POI[]> = new Map();
  private cellSize: number;

  constructor(pois: POI[], cellSizeDegrees: number = 0.01) {
    this.cellSize = cellSizeDegrees;
    this.buildIndex(pois);
  }

  private getCellKey(lat: number, lng: number): string {
    const cellLat = Math.floor(lat / this.cellSize);
    const cellLng = Math.floor(lng / this.cellSize);
    return `${cellLat},${cellLng}`;
  }

  private buildIndex(pois: POI[]): void {
    for (const poi of pois) {
      const key = this.getCellKey(poi.lat, poi.lng);
      const cell = this.cells.get(key) || [];
      cell.push(poi);
      this.cells.set(key, cell);
    }
  }

  /**
   * Find nearest POI using spatial index
   * Searches in expanding rings of cells until a POI is found
   */
  findNearest(point: Point, maxDistance: number): { poi: POI; distance: number } | null {
    const centerCellLat = Math.floor(point.lat / this.cellSize);
    const centerCellLng = Math.floor(point.lng / this.cellSize);

    // Convert max distance to approximate cell radius
    const maxCellRadius = Math.ceil(maxDistance / (this.cellSize * METERS_PER_DEGREE_LAT)) + 1;

    let nearestPOI: POI | null = null;
    let minDistance = Infinity;

    // Search in expanding rings
    for (let radius = 0; radius <= maxCellRadius; radius++) {
      // If we found a POI and the current ring is beyond the minimum distance, stop
      if (nearestPOI && radius * this.cellSize * METERS_PER_DEGREE_LAT > minDistance) {
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
          const cellPOIs = this.cells.get(key);

          if (cellPOIs) {
            for (const poi of cellPOIs) {
              const distance = haversineDistance(point, { lat: poi.lat, lng: poi.lng });
              if (distance < minDistance && distance <= maxDistance) {
                minDistance = distance;
                nearestPOI = poi;
              }
            }
          }
        }
      }
    }

    return nearestPOI ? { poi: nearestPOI, distance: minDistance } : null;
  }

  /**
   * Find distance to nearest POI using spatial index
   */
  findNearestDistance(point: Point, maxDistance: number): number {
    const result = this.findNearest(point, maxDistance);
    return result ? result.distance : Infinity;
  }

  /**
   * Count POIs within a given radius using spatial index
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
        const cellPOIs = this.cells.get(key);

        if (cellPOIs) {
          for (const poi of cellPOIs) {
            const distance = haversineDistance(point, { lat: poi.lat, lng: poi.lng });
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
