import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIs, generatePOICacheKey } from '@/lib/overpass';
import { calculateHeatmap } from '@/lib/calculator';
import { tileToBounds, getTilesForBounds } from '@/lib/grid';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS, POLAND_BOUNDS } from '@/config/factors';
import { POI, PrecomputedTile } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for tile generation

interface GenerateRequest {
  zoom: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  adminSecret: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { zoom, bounds: customBounds, adminSecret } = body;

    // Verify admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate zoom level
    if (zoom < 8 || zoom > 14) {
      return NextResponse.json(
        { error: 'Zoom level must be between 8 and 14' },
        { status: 400 }
      );
    }

    const bounds = customBounds || POLAND_BOUNDS;

    // Get all tiles for the bounds at this zoom level
    const tiles = getTilesForBounds(bounds, zoom);

    console.log(`Generating ${tiles.length} tiles at zoom ${zoom}`);

    // Get enabled factors
    const enabledFactors = DEFAULT_FACTORS.filter((f) => f.enabled && f.weight > 0);

    let generatedCount = 0;
    let errorCount = 0;

    // Process tiles in batches to avoid overwhelming the Overpass API
    const batchSize = 5;
    for (let i = 0; i < tiles.length; i += batchSize) {
      const batch = tiles.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (tile) => {
          try {
            const tileBounds = tileToBounds(tile.z, tile.x, tile.y);

            // Fetch POIs for this tile
            const poiData = new Map<string, POI[]>();

            for (const factor of enabledFactors) {
              const cacheKey = generatePOICacheKey(factor.id, tileBounds);

              const cached = await cacheGet<POI[]>(cacheKey);
              if (cached) {
                poiData.set(factor.id, cached);
              } else {
                try {
                  const pois = await fetchPOIs(factor.osmTags, tileBounds);
                  poiData.set(factor.id, pois);
                  await cacheSet(cacheKey, pois, 86400); // 24 hour TTL for POIs
                } catch (poiError) {
                  console.error(`Error fetching POIs for factor ${factor.id}:`, poiError);
                  poiData.set(factor.id, []);
                }
              }
            }

            // Calculate heatmap for this tile
            const gridSize = Math.max(50, 200 / Math.pow(2, zoom - 10)); // Adaptive grid size
            const heatmapPoints = calculateHeatmap(tileBounds, poiData, enabledFactors, gridSize);

            // Create pre-computed tile
            const precomputedTile: PrecomputedTile = {
              coordinates: tile,
              points: heatmapPoints,
              factorWeights: Object.fromEntries(
                enabledFactors.map((f) => [f.id, f.weight])
              ),
              generatedAt: new Date().toISOString(),
            };

            // Store in cache
            const tileCacheKey = `tile:${tile.z}:${tile.x}:${tile.y}`;
            await cacheSet(tileCacheKey, precomputedTile, 604800); // 7 day TTL

            generatedCount++;
          } catch (error) {
            console.error(`Error generating tile ${tile.z}/${tile.x}/${tile.y}:`, error);
            errorCount++;
          }
        })
      );

      // Small delay between batches to be nice to Overpass API
      if (i + batchSize < tiles.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      generated: generatedCount,
      errors: errorCount,
      total: tiles.length,
      zoom,
    });
  } catch (error) {
    console.error('Tile generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
