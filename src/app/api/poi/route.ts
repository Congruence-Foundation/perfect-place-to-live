import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIsFromOverpass as fetchPOIs, generatePOICacheKey } from '@/lib/poi';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import type { Bounds, POI } from '@/types';
import { isValidBounds } from '@/lib/geo';
import { PERFORMANCE_CONFIG } from '@/constants/performance';
import { errorResponse, handleApiError } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { POI_CACHE_TTL_SECONDS } = PERFORMANCE_CONFIG;

/** Error mappings for POI API */
const POI_ERROR_MAPPINGS = [
  { pattern: 'No valid factors found', status: 400 },
];

interface POIRequestBody {
  bounds: Bounds;
  factorIds: string[];
}

interface POIResponse {
  pois: Record<string, POI[]>;
  metadata: {
    factorCount: number;
    totalPOIs: number;
  };
}

/**
 * Validate bounds and factorIds, returning an error response if invalid
 */
function validatePOIRequest(bounds: Bounds, factorIds: string[]): Response | null {
  if (!isValidBounds(bounds)) {
    return errorResponse(new Error('Invalid bounds'), 400);
  }

  if (!factorIds || !Array.isArray(factorIds) || factorIds.length === 0) {
    return errorResponse(new Error('Invalid factor IDs'), 400);
  }

  return null;
}

/**
 * Fetch POIs for given factors with caching
 */
async function fetchPOIsWithCache(
  bounds: Bounds,
  factorIds: string[]
): Promise<POIResponse> {
  // Get factor configurations
  const factors = DEFAULT_FACTORS.filter((f) => factorIds.includes(f.id));

  if (factors.length === 0) {
    throw new Error('No valid factors found');
  }

  const results: Record<string, POI[]> = {};
  const fetchPromises: Promise<void>[] = [];

  for (const factor of factors) {
    const cacheKey = generatePOICacheKey(factor.id, bounds);

    fetchPromises.push(
      (async () => {
        // Try cache first
        const cached = await cacheGet<POI[]>(cacheKey);
        if (cached) {
          results[factor.id] = cached;
          return;
        }

        // Fetch from Overpass API
        try {
          const pois = await fetchPOIs(factor.osmTags, bounds);
          results[factor.id] = pois;

          // Cache the results
          await cacheSet(cacheKey, pois, POI_CACHE_TTL_SECONDS);
        } catch (error) {
          console.error(`Error fetching POIs for ${factor.id}:`, error);
          results[factor.id] = [];
        }
      })()
    );
  }

  await Promise.all(fetchPromises);

  return {
    pois: results,
    metadata: {
      factorCount: factors.length,
      totalPOIs: Object.values(results).reduce((sum, pois) => sum + pois.length, 0),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: POIRequestBody = await request.json();
    const { bounds, factorIds } = body;

    const validationError = validatePOIRequest(bounds, factorIds);
    if (validationError) return validationError;

    const result = await fetchPOIsWithCache(bounds, factorIds);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { 
      context: 'POI API', 
      errorMappings: POI_ERROR_MAPPINGS 
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const north = parseFloat(searchParams.get('north') || '');
    const south = parseFloat(searchParams.get('south') || '');
    const east = parseFloat(searchParams.get('east') || '');
    const west = parseFloat(searchParams.get('west') || '');
    const factorIds = searchParams.get('factorIds')?.split(',').filter(Boolean) || [];

    // Validate parsed values are actual numbers (not NaN)
    if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
      return errorResponse(new Error('Invalid bounds: coordinates must be valid numbers'), 400);
    }

    const bounds: Bounds = { north, south, east, west };
    
    const validationError = validatePOIRequest(bounds, factorIds);
    if (validationError) return validationError;

    const result = await fetchPOIsWithCache(bounds, factorIds);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { 
      context: 'POI API', 
      errorMappings: POI_ERROR_MAPPINGS 
    });
  }
}
