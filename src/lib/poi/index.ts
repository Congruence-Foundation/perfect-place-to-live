/**
 * POI (Points of Interest) utilities
 * Re-exports all POI-related functions
 */

// Overpass API
export {
  fetchPOIsFromOverpass,
  generatePOICacheKey,
} from './overpass';

// Unified service
export { fetchPOIs, fetchPOIsBatched, fetchPoisWithFallback } from './service';
export type { POIDataSource, FetchPoisWithFallbackResult } from './service';
