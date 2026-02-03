/**
 * Custom error classes for consistent error handling across the application
 */

/**
 * Data source for POI fetching
 * - neon: PostgreSQL database (fast, pre-cached)
 * - overpass: Overpass API (real-time, slower)
 */
export type POIDataSource = 'neon' | 'overpass';

/**
 * @deprecated Use POIDataSource instead
 */
export type DataSource = POIDataSource;

/**
 * Error thrown when POI fetching fails
 */
export class POIFetchError extends Error {
  constructor(
    message: string,
    public readonly source: POIDataSource,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'POIFetchError';
    
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, POIFetchError);
    }
  }
}
