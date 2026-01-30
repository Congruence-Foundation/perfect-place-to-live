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

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }
}

/**
 * Error thrown when Overpass API operations fail
 */
export class OverpassError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'OverpassError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OverpassError);
    }
  }
}

/**
 * Error thrown when bounds validation fails
 */
export class InvalidBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBoundsError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidBoundsError);
    }
  }
}
