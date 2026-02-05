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
export { fetchPOIs, fetchPOIsBatched, fetchPOIsWithFallback } from './service';
export type { POIDataSource } from '@/types';
