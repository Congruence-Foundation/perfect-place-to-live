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
} as const;

/**
 * Type for the performance config
 */
export type PerformanceConfig = typeof PERFORMANCE_CONFIG;
