import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIsFromOverpass as fetchPOIs, generatePOICacheKey } from '@/lib/poi';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import type { Bounds, POI } from '@/types';
import { isValidBounds } from '@/lib/geo';
import { PERFORMANCE_CONFIG } from '@/constants/performance';
import { errorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { POI_CACHE_TTL_SECONDS } = PERFORMANCE_CONFIG;

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
 * Handle POI API errors with appropriate status codes
 */
function handlePoiError(error: unknown): NextResponse {
  console.error('POI API error:', error);
  const status = error instanceof Error && error.message === 'No valid factors found' ? 400 : 500;
  return errorResponse(error, status);
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

    // Validate bounds
    if (!isValidBounds(bounds)) {
      return errorResponse(new Error('Invalid bounds'), 400);
    }

    // Validate factor IDs
    if (!factorIds || !Array.isArray(factorIds) || factorIds.length === 0) {
      return errorResponse(new Error('Invalid factor IDs'), 400);
    }

    const result = await fetchPOIsWithCache(bounds, factorIds);
    return NextResponse.json(result);
  } catch (error) {
    return handlePoiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const north = parseFloat(searchParams.get('north') || '');
    const south = parseFloat(searchParams.get('south') || '');
    const east = parseFloat(searchParams.get('east') || '');
    const west = parseFloat(searchParams.get('west') || '');
    const factorIds = searchParams.get('factorIds')?.split(',') || [];

    if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
      return errorResponse(new Error('Invalid bounds'), 400);
    }

    if (factorIds.length === 0) {
      return errorResponse(new Error('Invalid factor IDs'), 400);
    }

    const bounds: Bounds = { north, south, east, west };
    const result = await fetchPOIsWithCache(bounds, factorIds);
    return NextResponse.json(result);
  } catch (error) {
    return handlePoiError(error);
  }
}
