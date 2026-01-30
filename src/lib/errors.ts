/**
 * Custom error classes for consistent error handling across the application
 */

export type DataSource = 'neon' | 'overpass';

/**
 * Error thrown when POI fetching fails
 */
export class POIFetchError extends Error {
  constructor(
    message: string,
    public readonly source: DataSource,
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
