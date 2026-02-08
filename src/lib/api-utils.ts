import { NextRequest, NextResponse } from 'next/server';
import { encode } from '@msgpack/msgpack';
import { DEFAULT_FACTORS, getEnabledFactors } from '@/config/factors';
import type { Factor } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

interface ErrorMapping {
  pattern: string;
  status: number;
}

interface HandleApiErrorOptions {
  context: string;
  errorMappings?: ErrorMapping[];
  defaultStatus?: number;
}

/**
 * Standardized API error handler.
 * Logs the error and returns a consistent JSON error response.
 */
export function handleApiError(error: unknown, options: HandleApiErrorOptions): NextResponse {
  const { context, errorMappings = [], defaultStatus = 500 } = options;
  
  console.error(`${context} error:`, error);
  
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

/** Create a JSON error response from an error value */
export function errorResponse(error: unknown, status: number = 500): NextResponse {
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status });
}

/** Create a response with optional MessagePack encoding */
export function createResponse<T>(data: T, useMsgpack: boolean): Response {
  if (useMsgpack) {
    const encoded = encode(data);
    return new Response(encoded, {
      headers: { 'Content-Type': 'application/msgpack' },
    });
  }
  return NextResponse.json(data);
}

/** Check if the request accepts MessagePack format */
export function acceptsMsgpack(request: Request): boolean {
  return request.headers.get('Accept') === 'application/msgpack';
}

/** Format TTL seconds to human-readable string (e.g., "2 days", "30 minutes") */
export function formatTTL(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'invalid';
  if (seconds === 0) return '0 seconds';
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
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Validate and get enabled factors from request.
 * Returns the validated factors or an error Response if none are enabled.
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
 * Safely parse a JSON request body, returning the parsed value or an error Response
 * for empty/malformed bodies (e.g. aborted requests).
 */
export async function parseJsonBody<T>(request: NextRequest): Promise<T | Response> {
  try {
    const text = await request.text();
    if (!text || text.trim() === '') {
      return errorResponse(new Error('Request body is empty'), 400);
    }
    return JSON.parse(text) as T;
  } catch {
    return errorResponse(new Error('Invalid JSON in request body'), 400);
  }
}

/**
 * Type guard to validate tile coordinates.
 * 
 * Checks that all coordinates are finite non-negative integers,
 * zoom is 0-22, and x/y are within range for the zoom level.
 */
export function isValidTileCoord(tile: unknown): tile is TileCoord {
  if (tile == null || typeof tile !== 'object') return false;
  const { z, x, y } = tile as TileCoord;
  
  if (typeof z !== 'number' || typeof x !== 'number' || typeof y !== 'number') return false;
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (z < 0 || x < 0 || y < 0) return false;
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z > 22) return false;
  
  const maxTileIndex = (1 << z) - 1;
  if (x > maxTileIndex || y > maxTileIndex) return false;
  
  return true;
}
