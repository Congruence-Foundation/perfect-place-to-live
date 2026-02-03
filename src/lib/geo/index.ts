/**
 * Geographic utilities
 * Re-exports all geo-related functions and constants
 */

// Constants
export {
  EARTH_RADIUS_METERS,
  METERS_PER_DEGREE_LAT,
  POLAND_BOUNDS,
  POLAND_CENTER,
  OVERPASS_API_URL,
} from './constants';

// Distance calculations
export { metersPerDegreeLng, distanceInMeters } from './distance';

// Haversine distance and spatial indexing
export { haversineDistance, SpatialIndex } from './haversine';

// Bounds manipulation
export {
  snapBoundsForCacheKey,
  isValidBounds,
  expandBounds,
  isPointInBounds,
  getCombinedBounds,
  filterPoisToBounds,
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
  getTileKeyString,
  PROPERTY_TILE_ZOOM,
  getExpandedTilesForRadius,
  hashFilters,
  // Heatmap tile utilities
  type HeatmapConfig,
  HEATMAP_TILE_ZOOM,
  hashHeatmapConfig,
  getHeatmapTileKey,
  // POI tile utilities
  getPoiTileKey,
  calculatePoiTileRadius,
  getPoiTilesForHeatmapTiles,
} from './tiles';
