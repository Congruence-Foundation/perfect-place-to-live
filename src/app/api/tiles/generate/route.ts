import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIsFromOverpass as fetchPOIs, generatePOICacheKey } from '@/lib/poi';
import { calculateHeatmap } from '@/lib/scoring';
import { tileToBounds, getTilesForBounds, POLAND_BOUNDS } from '@/lib/geo';
import type { TileCoord } from '@/lib/geo/tiles';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import type { POI, PrecomputedTile, Factor } from '@/types';
import { errorResponse, handleApiError } from '@/lib/api-utils';
import { TILE_CONFIG, PERFORMANCE_CONFIG } from '@/constants/performance';

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

interface GenerationResult {
  generated: number;
  errors: number;
}

/**
 * Calculate adaptive grid size based on zoom level
 * Uses TILE_CONFIG constants for zoom-based scaling
 */
function calculateGridSizeForZoom(zoom: number): number {
  const { MIN_GRID_SIZE, BASE_GRID_SIZE, GRID_ZOOM_BASE } = TILE_CONFIG;
  const { MAX_CELL_SIZE } = PERFORMANCE_CONFIG;
  
  const calculatedSize = BASE_GRID_SIZE / Math.pow(2, zoom - GRID_ZOOM_BASE);
  
  // Clamp to reasonable bounds
  return Math.max(MIN_GRID_SIZE, Math.min(MAX_CELL_SIZE, calculatedSize));
}

/**
 * Fetch POIs for a factor with caching
 */
async function fetchFactorPOIs(
  factor: Factor,
  tileBounds: ReturnType<typeof tileToBounds>
): Promise<POI[]> {
  const cacheKey = generatePOICacheKey(factor.id, tileBounds);
  
  const cached = await cacheGet<POI[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const pois = await fetchPOIs(factor.osmTags, tileBounds);
    await cacheSet(cacheKey, pois, TILE_CONFIG.POI_CACHE_TTL_SECONDS);
    return pois;
  } catch (error) {
    console.error(`Error fetching POIs for factor ${factor.id}:`, error);
    return [];
  }
}

/**
 * Generate a single tile
 */
async function generateTile(
  tile: TileCoord,
  enabledFactors: Factor[],
  gridSize: number
): Promise<void> {
  const tileBounds = tileToBounds(tile.z, tile.x, tile.y);

  // Fetch POIs for all factors in parallel
  const poiResults = await Promise.all(
    enabledFactors.map(async (factor) => ({
      id: factor.id,
      pois: await fetchFactorPOIs(factor, tileBounds),
    }))
  );
  
  const poiData = new Map<string, POI[]>();
  for (const { id, pois } of poiResults) {
    poiData.set(id, pois);
  }

  // Calculate heatmap
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
}

/**
 * Process a batch of tiles
 */
async function processTileBatch(
  batch: TileCoord[],
  enabledFactors: Factor[],
  gridSize: number
): Promise<GenerationResult> {
  const results = await Promise.all(
    batch.map(async (tile): Promise<boolean> => {
      try {
        await generateTile(tile, enabledFactors, gridSize);
        return true;
      } catch (error) {
        console.error(`Error generating tile ${tile.z}/${tile.x}/${tile.y}:`, error);
        return false;
      }
    })
  );

  const generated = results.filter(Boolean).length;
  const errors = results.length - generated;

  return { generated, errors };
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
    const tiles = getTilesForBounds(bounds, zoom);
    const enabledFactors = DEFAULT_FACTORS.filter((f) => f.enabled && f.weight > 0);
    const gridSize = calculateGridSizeForZoom(zoom);

    console.log(`Generating ${tiles.length} tiles at zoom ${zoom}`);

    let totalGenerated = 0;
    let totalErrors = 0;

    // Process tiles in batches to avoid overwhelming the Overpass API
    for (let i = 0; i < tiles.length; i += TILE_CONFIG.BATCH_SIZE) {
      const batch = tiles.slice(i, i + TILE_CONFIG.BATCH_SIZE);
      const result = await processTileBatch(batch, enabledFactors, gridSize);
      
      totalGenerated += result.generated;
      totalErrors += result.errors;

      // Small delay between batches to be nice to Overpass API
      if (i + TILE_CONFIG.BATCH_SIZE < tiles.length) {
        await new Promise((resolve) => setTimeout(resolve, TILE_CONFIG.BATCH_DELAY_MS));
      }
    }

    return NextResponse.json({
      success: true,
      generated: totalGenerated,
      errors: totalErrors,
      total: tiles.length,
      zoom,
    });
  } catch (error) {
    return handleApiError(error, {
      context: 'Tile generation API',
      errorMappings: [
        { pattern: 'Unauthorized', status: 401 },
        { pattern: 'Zoom level must be', status: 400 },
      ],
    });
  }
}
