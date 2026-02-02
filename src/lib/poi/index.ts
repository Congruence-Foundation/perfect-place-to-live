/**
 * POI (Points of Interest) utilities
 * Re-exports all POI-related functions
 */

// Database queries
export { 
  getPOIsFromDB,
  getPOIsForTilesBatched,
  getPOIsWithDetailsFromDB, // Legacy alias
} from './db';

// Overpass API
export {
  fetchPOIsFromOverpass,
  fetchAllPOIsCombined,
  fetchPOIsForTilesBatched as fetchPOIsForTilesBatchedOverpass,
  generatePOICacheKey,
} from './overpass';

// Unified service
export { fetchPOIs, fetchPOIsBatched } from './service';
export type { DataSource } from './service';
