import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIs, generatePOICacheKey } from '@/lib/overpass';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import { Bounds, POI } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface POIRequestBody {
  bounds: Bounds;
  factorIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: POIRequestBody = await request.json();
    const { bounds, factorIds } = body;

    // Validate bounds
    if (!bounds || !bounds.north || !bounds.south || !bounds.east || !bounds.west) {
      return NextResponse.json({ error: 'Invalid bounds' }, { status: 400 });
    }

    // Validate factor IDs
    if (!factorIds || !Array.isArray(factorIds) || factorIds.length === 0) {
      return NextResponse.json({ error: 'Invalid factor IDs' }, { status: 400 });
    }

    // Get factor configurations
    const factors = DEFAULT_FACTORS.filter((f) => factorIds.includes(f.id));

    if (factors.length === 0) {
      return NextResponse.json({ error: 'No valid factors found' }, { status: 400 });
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
            await cacheSet(cacheKey, pois, 3600); // 1 hour TTL
          } catch (error) {
            console.error(`Error fetching POIs for ${factor.id}:`, error);
            results[factor.id] = [];
          }
        })()
      );
    }

    await Promise.all(fetchPromises);

    return NextResponse.json({
      pois: results,
      metadata: {
        factorCount: factors.length,
        totalPOIs: Object.values(results).reduce((sum, pois) => sum + pois.length, 0),
      },
    });
  } catch (error) {
    console.error('POI API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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

  // Reuse POST logic
  const bounds: Bounds = { north, south, east, west };

  const factors = DEFAULT_FACTORS.filter((f) => factorIds.includes(f.id));

  if (factors.length === 0) {
    return NextResponse.json({ error: 'No valid factors found' }, { status: 400 });
  }

  const results: Record<string, POI[]> = {};

  for (const factor of factors) {
    const cacheKey = generatePOICacheKey(factor.id, bounds);

    const cached = await cacheGet<POI[]>(cacheKey);
    if (cached) {
      results[factor.id] = cached;
      continue;
    }

    try {
      const pois = await fetchPOIs(factor.osmTags, bounds);
      results[factor.id] = pois;
      await cacheSet(cacheKey, pois, 3600);
    } catch (error) {
      console.error(`Error fetching POIs for ${factor.id}:`, error);
      results[factor.id] = [];
    }
  }

  return NextResponse.json({
    pois: results,
    metadata: {
      factorCount: factors.length,
      totalPOIs: Object.values(results).reduce((sum, pois) => sum + pois.length, 0),
    },
  });
}
