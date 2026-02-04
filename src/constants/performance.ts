/**
 * Performance-related configuration constants
 */

import type { POIDataSource } from '@/types/poi';

// ============================================================================
// Shared Constants (used across multiple configs)
// ============================================================================

/** Shared tile zoom level for all tile-based systems */
const SHARED_TILE_ZOOM = 13;

/** Shared batch size for parallel tile processing */
const SHARED_BATCH_SIZE = 5;

/** 24 hours in seconds - common TTL for server caches */
const TTL_24_HOURS = 86400;

export const PERFORMANCE_CONFIG = {
  /** Default data source for POI fetching */
  DEFAULT_DATA_SOURCE: 'neon' as POIDataSource,
  
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
  MIN_CELL_SIZE: 100,
  
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
  POI_CACHE_TTL_SECONDS: TTL_24_HOURS,
  
  /** Cache TTL for generated tiles (seconds) - 7 days */
  TILE_CACHE_TTL_SECONDS: 604800,
  
  /** Number of tiles to process in parallel */
  BATCH_SIZE: SHARED_BATCH_SIZE,
  
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
  
  /** Base delay for combined queries (ms) - longer due to heavier load */
  COMBINED_BASE_DELAY_MS: 2000,
  
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
  TILE_ZOOM: SHARED_TILE_ZOOM,
  
  /** Minimum zoom level to display properties */
  MIN_DISPLAY_ZOOM: 10,
  
  /** Zoom level where tile-based fetching starts (below this, viewport-based fetching is used) */
  TILE_MODE_ZOOM: 14,
  
  /** Maximum viewport tiles before showing "zoom in" message */
  MAX_VIEWPORT_TILES: 25,
  
  /** Hard limit on total tiles including radius buffer */
  MAX_TOTAL_TILES: 50,
  
  /** Number of tiles to fetch per batch (to respect Otodom API limits) */
  BATCH_SIZE: SHARED_BATCH_SIZE,
  
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
  TILE_ZOOM: SHARED_TILE_ZOOM,
  
  /** Maximum viewport tiles before showing "zoom in" message */
  MAX_VIEWPORT_TILES: 36,
  
  /** Hard limit on total tiles including radius buffer */
  MAX_TOTAL_TILES: 64,
  
  /** Number of tiles to fetch per batch */
  BATCH_SIZE: SHARED_BATCH_SIZE,
  
  /** Delay between batches in milliseconds */
  BATCH_DELAY_MS: 1,
  
  /** Default heatmap tile radius (number of tile layers around viewport) */
  DEFAULT_TILE_RADIUS: 0,
  
  /** Maximum heatmap tile radius */
  MAX_TILE_RADIUS: 2,
  
  /** Server-side LRU cache maximum entries */
  SERVER_LRU_MAX: 10000,
  
  /** Server-side cache TTL in seconds - 24 hours (aligned with POI cache) */
  SERVER_TTL_SECONDS: TTL_24_HOURS,
  
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
  TILE_ZOOM: SHARED_TILE_ZOOM,
  
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
  SERVER_TTL_SECONDS: TTL_24_HOURS,
  
  /** Approximate tile size in meters at Poland's latitude (~52°) for zoom 13 */
  TILE_SIZE_METERS: 2400,
} as const;

/**
 * Base cache configuration for Redis/memory fallback
 */
export const CACHE_CONFIG = {
  /** Default TTL for cache entries in seconds - 1 hour */
  DEFAULT_TTL_SECONDS: 3600,
  
  /** Maximum entries in memory cache fallback */
  MEMORY_CACHE_MAX_SIZE: 10000,
  
  /** Fraction of entries to evict when memory cache is full */
  EVICTION_RATIO: 0.1,
} as const;

/**
 * UI-related configuration constants
 */
export const UI_CONFIG = {
  /** Default grid cell size in meters */
  DEFAULT_GRID_CELL_SIZE: 200,
  
  /** Default threshold for detailed mode (max cluster count) */
  DEFAULT_DETAILED_MODE_THRESHOLD: 100,
  
  /** Default zoom level for fly-to operations */
  DEFAULT_FLY_TO_ZOOM: 13,
  
  /** Debounce delay for bounds changes (ms) */
  BOUNDS_DEBOUNCE_MS: 500,
  
  /** Debounce delay for factor changes (ms) */
  FACTORS_DEBOUNCE_MS: 300,
  
  /** Duration for notification display (ms) */
  NOTIFICATION_DURATION_MS: 3000,
  
  /** Geolocation timeout (ms) */
  GEOLOCATION_TIMEOUT_MS: 10000,
  
  /** Geolocation max age (ms) */
  GEOLOCATION_MAX_AGE_MS: 300000,
  
  /** Default heatmap opacity */
  DEFAULT_HEATMAP_OPACITY: 0.30,
  
  /** Search radius multiplier for heatmap point lookup */
  SEARCH_RADIUS_MULTIPLIER: 1.5,
  
  /** Tooltip delay duration (ms) */
  TOOLTIP_DELAY_MS: 300,
  
  /** Default initial zoom level */
  DEFAULT_INITIAL_ZOOM: 7,
  
  /** SSR fallback window height (px) */
  SSR_FALLBACK_WINDOW_HEIGHT: 800,
  
  /** Panel width for desktop sidebar (px) */
  PANEL_WIDTH: 320,
  
  /** Panel animation duration (ms) */
  PANEL_ANIMATION_DURATION_MS: 350,
  
  /** Default bottom sheet height for SSR fallback (px) */
  DEFAULT_BOTTOM_SHEET_HEIGHT: 56,
  
  /** Bottom sheet height as fraction of window height */
  BOTTOM_SHEET_HEIGHT_RATIO: 0.07,
  
  /** Default sensitivity for distance curve calculations */
  DEFAULT_SENSITIVITY: 2,
  
  /** Threshold for detecting zoom changes (area ratio) */
  ZOOM_CHANGE_THRESHOLD: 0.9,
} as const;

/**
 * Time constants for common durations
 */
export const TIME_CONSTANTS = {
  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,
  /** Seconds per hour */
  SECONDS_PER_HOUR: 3600,
  /** Seconds per day */
  SECONDS_PER_DAY: 86400,
  /** Cookie max age for locale preference (1 year in seconds) */
  LOCALE_COOKIE_MAX_AGE: 31536000,
} as const;

/**
 * Fetch and network configuration
 */
export const FETCH_CONFIG = {
  /** Heatmap fetch timeout (ms) */
  HEATMAP_FETCH_TIMEOUT_MS: 30000,
  /** Query client retry count */
  QUERY_RETRY_COUNT: 2,
} as const;

/**
 * Canvas rendering configuration
 */
export const CANVAS_CONFIG = {
  /** Cell overlap multiplier for smooth blending */
  CELL_OVERLAP_MULTIPLIER: 1.2,
  /** Minimum cell size in pixels */
  MIN_CELL_SIZE_PX: 3,
  /** Tile boundary blur in pixels */
  TILE_BOUNDARY_BLUR_PX: 3,
} as const;

/**
 * Coordinate precision configuration
 */
export const COORDINATE_CONFIG = {
  /** Decimal places for coordinate deduplication (~0.1m precision) */
  DEDUP_PRECISION: 6,
} as const;

/**
 * Weight slider thresholds for label display
 */
export const WEIGHT_THRESHOLDS = {
  /** Threshold for "strong" preference/avoidance */
  STRONG: 80,
  /** Threshold for "moderate" preference/avoidance */
  MODERATE: 50,
} as const;

/**
 * Parallel processing configuration for heatmap calculations
 */
export const PARALLEL_CONFIG = {
  /** Minimum points per worker to justify overhead */
  MIN_POINTS_PER_WORKER: 3000,
  /** Minimum total points to use parallel processing (below this, single-threaded is faster) */
  MIN_POINTS_FOR_PARALLEL: 10000,
  /** Maximum number of workers (capped to avoid diminishing returns) */
  MAX_WORKERS_CAP: 8,
} as const;

/**
 * Spatial index configuration
 */
export const SPATIAL_INDEX_CONFIG = {
  /** Default cell size in degrees for spatial indexing (~1.1km at equator) */
  DEFAULT_CELL_SIZE_DEGREES: 0.01,
} as const;
