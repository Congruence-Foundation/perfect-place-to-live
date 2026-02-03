/**
 * Geographic utilities
 * Re-exports all geo-related functions and constants
 */

// Constants
export { EARTH_RADIUS_METERS, METERS_PER_DEGREE_LAT } from './constants';

// Distance calculations
export { toRad, metersPerDegreeLng, distanceInMeters } from './distance';

// Haversine distance and spatial indexing
export { haversineDistance, SpatialIndex } from './haversine';

// Bounds manipulation
export {
  snapBoundsForCacheKey,
  isValidBounds,
  expandBounds,
  isPointInBounds,
  createCoordKey,
} from './bounds';

// Grid generation and tile utilities
export {
  generateGrid,
  estimateGridSize,
  calculateAdaptiveGridSize,
  tileToBounds,
  getTilesForBounds,
} from './grid';

// Property tile utilities
export {
  type TileCoord,
  PROPERTY_TILE_ZOOM,
  getTileKey,
  getExpandedTilesForRadius,
  hashFilters,
  // Heatmap tile utilities
  type HeatmapConfig,
  HEATMAP_TILE_ZOOM,
  hashHeatmapConfig,
  getHeatmapTileKey,
  // POI tile utilities
  POI_TILE_ZOOM,
  getPoiTileKey,
  calculatePoiTileRadius,
  getPoiTilesForHeatmapTiles,
} from './tiles';
