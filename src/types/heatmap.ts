import type { Bounds, POIDataSource } from './poi';
import type { Factor } from './factors';

export type DistanceCurve = 'linear' | 'log' | 'exp' | 'power';

/**
 * Cluster price analysis mode
 * - off: No price analysis on clusters
 * - simplified: Use nearby loaded properties for analysis (fast)
 * - detailed: Fetch actual property data from API (accurate, slower)
 */
export type ClusterPriceAnalysisMode = 'off' | 'simplified' | 'detailed';

/**
 * Cluster price display mode
 */
export type ClusterPriceDisplay = 'none' | 'range' | 'median' | 'median_spread';

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
  clusterPriceDisplay: ClusterPriceDisplay; // how to show prices on cluster pins
  clusterPriceAnalysis: ClusterPriceAnalysisMode; // how to analyze prices for clusters
  detailedModeThreshold: number; // max cluster count for detailed mode (default 100)
}

export interface HeatmapRequest {
  bounds: Bounds;
  factors: Factor[];
  gridSize: number;
  distanceCurve?: DistanceCurve;
  sensitivity?: number;
  normalizeToViewport?: boolean;
  dataSource?: POIDataSource;
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
