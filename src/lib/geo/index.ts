/**
 * Geographic utilities
 * Re-exports all geo-related functions and constants
 */

// Constants
export {
  METERS_PER_DEGREE_LAT,
  POLAND_BOUNDS,
  POLAND_CENTER,
} from './constants';

// Distance calculations
export { metersPerDegreeLng, distanceInMeters, createCoordinateKey, createClusterId } from './distance';

// Haversine distance and spatial indexing
export { haversineDistance, SpatialIndex, GenericSpatialIndex, type GeoLocated } from './haversine';

// Bounds manipulation
export {
  snapBoundsForCacheKey,
  isValidBounds,
  expandBounds,
  getCombinedBounds,
  filterPoisToBounds,
} from './bounds';

// Grid generation and tile utilities
export {
  generateGrid,
  estimateGridSize,
  calculateAdaptiveGridSize,
  calculateTileGridSize,
  tileToBounds,
  getTilesForBounds,
} from './grid';

// Property tile utilities
export {
  type TileCoord,
  getTileKeyString,
  latLngToTile,
  PROPERTY_TILE_ZOOM,
  calculateTilesWithRadius,
  hashFilters,
  // Heatmap tile utilities
  HEATMAP_TILE_ZOOM,
  calculateTileDelta,
  hashHeatmapConfig,
  getHeatmapTileKey,
  // POI tile utilities
  getPoiTileKey,
  getPoiTilesForHeatmapTiles,
} from './tiles';

// Heatmap point lookup
export { findNearestHeatmapPoint, getScoreForLocation } from './heatmap-lookup';
