import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIsFromOverpass as fetchPOIs, generatePOICacheKey } from '@/lib/poi';
import { calculateHeatmap } from '@/lib/scoring';
import { tileToBounds, getTilesForBounds } from '@/lib/geo';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS, POLAND_BOUNDS } from '@/config/factors';
import { POI, PrecomputedTile } from '@/types';
import { errorResponse } from '@/lib/api-utils';
import { TILE_CONFIG } from '@/constants/performance';

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
      return errorResponse(new Error('Unauthorized'), 401);
    }

    // Validate zoom level
    if (zoom < TILE_CONFIG.MIN_ZOOM || zoom > TILE_CONFIG.MAX_ZOOM) {
      return errorResponse(new Error(`Zoom level must be between ${TILE_CONFIG.MIN_ZOOM} and ${TILE_CONFIG.MAX_ZOOM}`), 400);
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
    for (let i = 0; i < tiles.length; i += TILE_CONFIG.BATCH_SIZE) {
      const batch = tiles.slice(i, i + TILE_CONFIG.BATCH_SIZE);

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
                  await cacheSet(cacheKey, pois, TILE_CONFIG.POI_CACHE_TTL_SECONDS);
                } catch (poiError) {
                  console.error(`Error fetching POIs for factor ${factor.id}:`, poiError);
                  poiData.set(factor.id, []);
                }
              }
            }

            // Calculate heatmap for this tile - adaptive grid size based on zoom
            const gridSize = Math.max(
              TILE_CONFIG.MIN_GRID_SIZE,
              TILE_CONFIG.BASE_GRID_SIZE / Math.pow(2, zoom - TILE_CONFIG.GRID_ZOOM_BASE)
            );
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
            await cacheSet(tileCacheKey, precomputedTile, TILE_CONFIG.TILE_CACHE_TTL_SECONDS);

            generatedCount++;
          } catch (error) {
            console.error(`Error generating tile ${tile.z}/${tile.x}/${tile.y}:`, error);
            errorCount++;
          }
        })
      );

      // Small delay between batches to be nice to Overpass API
      if (i + TILE_CONFIG.BATCH_SIZE < tiles.length) {
        await new Promise((resolve) => setTimeout(resolve, TILE_CONFIG.BATCH_DELAY_MS));
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
    return errorResponse(error);
  }
}
