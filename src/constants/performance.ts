/**
 * Performance-related configuration constants
 */

import { DataSource } from '@/lib/errors';

export const PERFORMANCE_CONFIG = {
  /** Maximum POIs to process in a single batch */
  MAX_BATCH_SIZE: 1000,
  
  /** Delay between Overpass API calls (ms) */
  OVERPASS_DELAY_MS: 5000,
  
  /** Canvas rendering chunk size */
  CANVAS_CHUNK_SIZE: 10000,
  
  /** Default data source for POI fetching */
  DEFAULT_DATA_SOURCE: 'neon' as DataSource,
  
  /** Maximum grid points to prevent server overload */
  MAX_GRID_POINTS: 50000,
  
  /** Buffer distance in degrees for POI fetching (~10km at mid-latitudes) */
  POI_BUFFER_DEGREES: 0.1,
  
  /** Buffer distance in degrees for grid/canvas (~5km at mid-latitudes) */
  GRID_BUFFER_DEGREES: 0.05,
  
  /** Cache TTL for POI data (seconds) */
  POI_CACHE_TTL_SECONDS: 3600,
  
  /** Target number of grid points for adaptive sizing */
  TARGET_GRID_POINTS: 5000,
  
  /** Minimum cell size in meters for grid calculations */
  MIN_CELL_SIZE: 50,
  
  /** Maximum cell size in meters for grid calculations */
  MAX_CELL_SIZE: 300,
  
  /** Fallback minimum cell size when viewport is too large */
  FALLBACK_MIN_CELL_SIZE: 50,
  
  /** Fallback maximum cell size when viewport is too large */
  FALLBACK_MAX_CELL_SIZE: 2000,
  
  /** Tolerance multiplier for max grid points check */
  MAX_GRID_POINTS_TOLERANCE: 1.5,
} as const;

/**
 * Tile generation configuration
 */
export const TILE_CONFIG = {
  /** Cache TTL for POIs during tile generation (seconds) - 24 hours */
  POI_CACHE_TTL_SECONDS: 86400,
  
  /** Cache TTL for generated tiles (seconds) - 7 days */
  TILE_CACHE_TTL_SECONDS: 604800,
  
  /** Number of tiles to process in parallel */
  BATCH_SIZE: 5,
  
  /** Delay between batches (ms) */
  BATCH_DELAY_MS: 1000,
  
  /** Minimum zoom level for tile generation */
  MIN_ZOOM: 8,
  
  /** Maximum zoom level for tile generation */
  MAX_ZOOM: 14,
  
  /** Base grid size for adaptive calculation */
  BASE_GRID_SIZE: 200,
  
  /** Minimum grid size for tiles */
  MIN_GRID_SIZE: 50,
  
  /** Zoom level base for grid size calculation */
  GRID_ZOOM_BASE: 10,
} as const;

/**
 * Property cluster configuration
 */
export const CLUSTER_CONFIG = {
  /** Default page number for pagination */
  DEFAULT_PAGE: 1,
  
  /** Default number of results per page */
  DEFAULT_LIMIT: 36,
  
  /** Default cluster radius in meters */
  DEFAULT_RADIUS_METERS: 1000,
} as const;

/**
 * Overpass API retry and timeout configuration
 */
export const OVERPASS_CONFIG = {
  /** Timeout for single-factor queries (seconds) */
  TIMEOUT_SINGLE: 30,
  
  /** Timeout for combined multi-factor queries (seconds) */
  TIMEOUT_COMBINED: 60,
  
  /** Number of retry attempts */
  RETRY_COUNT: 3,
  
  /** Base delay between retries (ms) */
  BASE_DELAY_MS: 1000,
  
  /** Maximum delay between retries (ms) */
  MAX_DELAY_MS: 10000,
  
  /** HTTP status codes that trigger a retry */
  RETRYABLE_STATUSES: [429, 503, 504] as const,
} as const;

/**
 * Density bonus configuration for heatmap calculations
 * Rewards areas with multiple nearby POIs of the same type
 */
export const DENSITY_BONUS = {
  /** Consider POIs within this fraction of maxDistance for density (0.5 = 50%) */
  RADIUS_RATIO: 0.5,
  
  /** Maximum bonus as a fraction (0.15 = 15% improvement) */
  MAX: 0.15,
  
  /** Number of additional POIs needed for full bonus */
  SCALE: 3,
} as const;

/**
 * Property tile configuration for real estate extension
 * Uses fixed zoom level tiles for optimal cache efficiency
 */
export const PROPERTY_TILE_CONFIG = {
  /** Fixed tile zoom level for property fetching (~2.4km x 2.4km tiles at Poland's latitude) */
  TILE_ZOOM: 13,
  
  /** Minimum zoom level to display properties */
  MIN_DISPLAY_ZOOM: 10,
  
  /** Zoom level where tile-based fetching starts (below this, viewport-based fetching is used) */
  TILE_MODE_ZOOM: 14,
  
  /** Maximum viewport tiles before showing "zoom in" message */
  MAX_VIEWPORT_TILES: 25,
  
  /** Hard limit on total tiles including radius buffer */
  MAX_TOTAL_TILES: 50,
  
  /** Number of tiles to fetch per batch (to respect Otodom API limits) */
  BATCH_SIZE: 5,
  
  /** Delay between batches in milliseconds */
  BATCH_DELAY_MS: 100,
  
  /** Client-side cache stale time (React Query) - 5 minutes */
  CLIENT_STALE_TIME_MS: 5 * 60 * 1000,
  
  /** Client-side cache garbage collection time (React Query) - 30 minutes */
  CLIENT_GC_TIME_MS: 30 * 60 * 1000,
  
  /** Server-side LRU cache maximum entries */
  SERVER_LRU_MAX: 1000,
  
  /** Server-side cache TTL in seconds - 12 hours */
  SERVER_TTL_SECONDS: 43200,
  
  /** Default price analysis radius (number of tile layers around viewport) - 0 means viewport tiles only */
  DEFAULT_PRICE_RADIUS: 0,
  
  /** Maximum price analysis radius */
  MAX_PRICE_RADIUS: 2,
} as const;

/**
 * Heatmap tile configuration for tile-based heatmap caching
 * Uses fixed zoom level tiles for optimal cache efficiency
 */
export const HEATMAP_TILE_CONFIG = {
  /** Fixed tile zoom level for heatmap (~2.4km x 2.4km tiles at Poland's latitude) */
  TILE_ZOOM: 13,
  
  /** Maximum viewport tiles before showing "zoom in" message */
  MAX_VIEWPORT_TILES: 36,
  
  /** Hard limit on total tiles including radius buffer */
  MAX_TOTAL_TILES: 64,
  
  /** Number of tiles to fetch per batch */
  BATCH_SIZE: 5,
  
  /** Delay between batches in milliseconds */
  BATCH_DELAY_MS: 1,
  
  /** Default heatmap tile radius (number of tile layers around viewport) */
  DEFAULT_TILE_RADIUS: 0,
  
  /** Maximum heatmap tile radius */
  MAX_TILE_RADIUS: 2,
  
  /** Server-side LRU cache maximum entries */
  SERVER_LRU_MAX: 10000,
  
  /** Server-side cache TTL in seconds - 24 hours (aligned with POI cache) */
  SERVER_TTL_SECONDS: 86400,
  
  /** Client-side cache stale time (React Query) - 10 minutes */
  CLIENT_STALE_TIME_MS: 10 * 60 * 1000,
  
  /** Client-side cache garbage collection time (React Query) - 1 hour */
  CLIENT_GC_TIME_MS: 60 * 60 * 1000,
} as const;

/**
 * POI tile configuration for tile-aligned POI caching
 * POIs are cached per world-grid tile for stable cache keys
 */
export const POI_TILE_CONFIG = {
  /** Fixed tile zoom level for POI caching (same as heatmap for simplicity) */
  TILE_ZOOM: 13,
  
  /** Default POI buffer scale multiplier (applied to max factor distance) */
  DEFAULT_POI_BUFFER_SCALE: 2,
  
  /** Minimum POI buffer scale */
  MIN_POI_BUFFER_SCALE: 1,
  
  /** Maximum POI buffer scale */
  MAX_POI_BUFFER_SCALE: 2,
  
  /** Maximum POI tile radius to prevent excessive fetching */
  MAX_POI_TILE_RADIUS: 10,
  
  /** Server-side LRU cache maximum entries for POI tiles */
  SERVER_LRU_MAX: 1000,
  
  /** Server-side cache TTL in seconds - 24 hours */
  SERVER_TTL_SECONDS: 86400,
  
  /** Approximate tile size in meters at Poland's latitude (~52°) for zoom 13 */
  TILE_SIZE_METERS: 2400,
} as const;
