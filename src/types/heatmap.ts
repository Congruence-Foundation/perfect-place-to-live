import { Bounds } from './poi';
import { Factor } from './factors';
import { POI } from './poi';

export type DistanceCurve = 'linear' | 'log' | 'exp' | 'power';

export type DataSource = 'neon' | 'overpass';

export interface HeatmapPoint {
  lat: number;
  lng: number;
  value: number;
}

/**
 * Settings for heatmap calculation and display
 */
export interface HeatmapSettings {
  gridCellSize: number; // in meters (25-300)
  distanceCurve: DistanceCurve; // distance scoring function
  sensitivity: number; // curve steepness (0.5-3, default 1)
  normalizeToViewport: boolean; // normalize K values to viewport range
}

export interface HeatmapRequest {
  bounds: Bounds;
  factors: Factor[];
  gridSize: number;
  distanceCurve?: DistanceCurve;
  sensitivity?: number;
  normalizeToViewport?: boolean;
  dataSource?: DataSource;
}

export interface HeatmapResponse {
  points: HeatmapPoint[];
  pois: Record<string, POI[]>;
  metadata: {
    gridSize: number | string;
    pointCount: number;
    computeTimeMs: number;
    factorCount: number;
    dataSource?: DataSource;
    poiCounts: Record<string, number>;
  };
}

export interface TileCoordinates {
  z: number;
  x: number;
  y: number;
}

export interface PrecomputedTile {
  coordinates: TileCoordinates;
  points: HeatmapPoint[];
  factorWeights: Record<string, number>;
  generatedAt: string;
}
