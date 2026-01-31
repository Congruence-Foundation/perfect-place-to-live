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
  MIN_CELL_SIZE: 100,
  
  /** Maximum cell size in meters for grid calculations */
  MAX_CELL_SIZE: 500,
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
