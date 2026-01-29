import { Bounds, Point } from './poi';
import { Factor } from './factors';
import { POI } from './poi';

export type DistanceCurve = 'linear' | 'log' | 'exp' | 'power';

export interface HeatmapPoint {
  lat: number;
  lng: number;
  value: number;
}

export interface HeatmapRequest {
  bounds: Bounds;
  factors: Factor[];
  gridSize: number;
  distanceCurve?: DistanceCurve;
  sensitivity?: number;
  normalizeToViewport?: boolean;
}

export interface HeatmapResponse {
  points: HeatmapPoint[];
  pois: Record<string, POI[]>;
  metadata: {
    gridSize: number | string;
    pointCount: number;
    computeTimeMs: number;
    factorCount: number;
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
