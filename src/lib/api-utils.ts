import { NextResponse } from 'next/server';
import { encode } from '@msgpack/msgpack';
import { TIME_CONSTANTS } from '@/constants/performance';
import { DEFAULT_FACTORS, getEnabledFactors } from '@/config/factors';
import type { Factor } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';

const { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE } = TIME_CONSTANTS;

/**
 * Error mapping configuration for API error handling
 * Maps error message patterns to HTTP status codes
 */
export interface ErrorMapping {
  /** Pattern to match in error message */
  pattern: string;
  /** HTTP status code to return */
  status: number;
}

/**
 * Options for handleApiError
 */
export interface HandleApiErrorOptions {
  /** Context string for logging (e.g., 'Heatmap API', 'POI API') */
  context: string;
  /** Optional error mappings to determine status code based on error message */
  errorMappings?: ErrorMapping[];
  /** Default status code if no mapping matches (default: 500) */
  defaultStatus?: number;
}

/**
 * Standardized API error handler
 * Logs the error and returns a consistent error response
 * 
 * @param error - The error object or unknown value
 * @param options - Error handling options
 * @returns NextResponse with error message and appropriate status code
 * 
 * @example
 * ```ts
 * // Simple usage
 * catch (error) {
 *   return handleApiError(error, { context: 'Heatmap API' });
 * }
 * 
 * // With error mappings
 * catch (error) {
 *   return handleApiError(error, {
 *     context: 'Properties API',
 *     errorMappings: [
 *       { pattern: 'Otodom API error', status: 502 },
 *       { pattern: 'Invalid bounds', status: 400 },
 *     ],
 *   });
 * }
 * ```
 */
export function handleApiError(error: unknown, options: HandleApiErrorOptions): NextResponse {
  const { context, errorMappings = [], defaultStatus = 500 } = options;
  
  // Log the error with context
  console.error(`${context} error:`, error);
  
  // Determine status code based on error mappings
  let status = defaultStatus;
  if (error instanceof Error && errorMappings.length > 0) {
    for (const mapping of errorMappings) {
      if (error.message.includes(mapping.pattern)) {
        status = mapping.status;
        break;
      }
    }
  }
  
  return errorResponse(error, status);
}

/**
 * Create a standardized error response for API routes
 * 
 * @param error - The error object or unknown value
 * @param status - HTTP status code (default: 500)
 * @returns NextResponse with error message
 */
export function errorResponse(error: unknown, status: number = 500): NextResponse {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create a response with optional MessagePack encoding
 * 
 * @param data - The data to encode
 * @param useMsgpack - Whether to use MessagePack encoding
 * @returns Response with appropriate content type
 */
export function createResponse<T>(data: T, useMsgpack: boolean): Response {
  if (useMsgpack) {
    const encoded = encode(data);
    return new Response(encoded, {
      headers: { 'Content-Type': 'application/msgpack' },
    });
  }
  return NextResponse.json(data);
}

/**
 * Check if the request accepts MessagePack format
 * 
 * @param request - The incoming request
 * @returns Whether the client accepts MessagePack
 */
export function acceptsMsgpack(request: Request): boolean {
  return request.headers.get('Accept') === 'application/msgpack';
}

/**
 * Format TTL seconds to human-readable string
 * 
 * @param seconds - TTL in seconds
 * @returns Human-readable duration string (e.g., "2 days", "1 hour", "30 minutes")
 */
export function formatTTL(seconds: number): string {
  if (seconds >= SECONDS_PER_DAY) {
    const days = Math.floor(seconds / SECONDS_PER_DAY);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if (seconds >= SECONDS_PER_MINUTE) {
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

/**
 * Validate and get enabled factors from request
 * Returns either the validated factors or an error response
 * 
 * @param requestFactors - Factors from request body (optional)
 * @returns Object with factors and enabledFactors, or an error Response
 */
export function getValidatedFactors(
  requestFactors?: Factor[]
): { factors: Factor[]; enabledFactors: Factor[] } | Response {
  const factors: Factor[] = requestFactors || DEFAULT_FACTORS;
  const enabledFactors = getEnabledFactors(factors);

  if (enabledFactors.length === 0) {
    return errorResponse(new Error('No enabled factors'), 400);
  }

  return { factors, enabledFactors };
}

/**
 * Type guard to validate tile coordinates
 * 
 * @param tile - The value to check
 * @returns Whether the value is a valid TileCoord
 */
export function isValidTileCoord(tile: unknown): tile is TileCoord {
  return (
    tile != null &&
    typeof tile === 'object' &&
    typeof (tile as TileCoord).z === 'number' &&
    typeof (tile as TileCoord).x === 'number' &&
    typeof (tile as TileCoord).y === 'number' &&
    !isNaN((tile as TileCoord).z) &&
    !isNaN((tile as TileCoord).x) &&
    !isNaN((tile as TileCoord).y)
  );
}
