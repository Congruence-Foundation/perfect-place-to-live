import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIs, generatePOICacheKey } from '@/lib/overpass';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import { Bounds, POI } from '@/types';
import { isValidBounds } from '@/lib/bounds';
import { PERFORMANCE_CONFIG } from '@/constants';

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
      return NextResponse.json({ error: 'Invalid bounds' }, { status: 400 });
    }

    // Validate factor IDs
    if (!factorIds || !Array.isArray(factorIds) || factorIds.length === 0) {
      return NextResponse.json({ error: 'Invalid factor IDs' }, { status: 400 });
    }

    const result = await fetchPOIsWithCache(bounds, factorIds);
    return NextResponse.json(result);
  } catch (error) {
    console.error('POI API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'No valid factors found' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const north = parseFloat(searchParams.get('north') || '');
  const south = parseFloat(searchParams.get('south') || '');
  const east = parseFloat(searchParams.get('east') || '');
  const west = parseFloat(searchParams.get('west') || '');
  const factorIds = searchParams.get('factorIds')?.split(',') || [];

  if (isNaN(north) || isNaN(south) || isNaN(east) || isNaN(west)) {
    return NextResponse.json({ error: 'Invalid bounds' }, { status: 400 });
  }

  if (factorIds.length === 0) {
    return NextResponse.json({ error: 'Invalid factor IDs' }, { status: 400 });
  }

  try {
    const bounds: Bounds = { north, south, east, west };
    const result = await fetchPOIsWithCache(bounds, factorIds);
    return NextResponse.json(result);
  } catch (error) {
    console.error('POI API error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'No valid factors found' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
