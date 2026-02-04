/**
 * Batch Heatmap API Endpoint
 * 
 * Fetches heatmap data for multiple tiles at once using tile-aligned POI caching.
 * 
 * Optimizations:
 * 1. Parallel cache checks for all tiles
 * 2. Single batched POI fetch for all uncached tiles
 * 3. POI tiles cached independently with stable keys
 * 4. MessagePack encoding for ~30% smaller responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
import { buildSpatialIndexes } from '@/lib/scoring/calculator';
import type { Factor, POI, HeatmapPoint, Bounds } from '@/types';
import { tileToBounds, isValidBounds, calculateTileGridSize } from '@/lib/geo';
import { 
  getHeatmapTileKey, 
  hashHeatmapConfig, 
  getPoiTilesForHeatmapTiles,
  type TileCoord,
} from '@/lib/geo/tiles';
import { 
  getCachedHeatmapTile, 
  setCachedHeatmapTile,
  getHeatmapTileCacheStats,
  type HeatmapTileCacheEntry,
} from '@/lib/heatmap-tile-cache';
import { getPoiTilesForArea, filterPoisToViewport, getPoiTileCacheStats } from '@/lib/poi-tile-cache';
import { errorResponse, createResponse, acceptsMsgpack, getValidatedFactors, isValidTileCoord, handleApiError } from '@/lib/api-utils';
import { PERFORMANCE_CONFIG, POI_TILE_CONFIG } from '@/constants/performance';
import type { POIDataSource } from '@/lib/poi';
import { createTimer } from '@/lib/profiling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { DEFAULT_DATA_SOURCE } = PERFORMANCE_CONFIG;

// ============================================================================
// Types
// ============================================================================

interface BatchHeatmapRequest {
  tiles: Array<{ z: number; x: number; y: number }>;
  factors?: Factor[];
  distanceCurve?: string;
  sensitivity?: number;
  normalizeToViewport?: boolean;
  dataSource?: POIDataSource;
  poiBufferScale?: number;
  viewportBounds?: Bounds;
}

interface BatchHeatmapResponse {
  tiles: Record<string, { points: HeatmapPoint[]; cached: boolean }>;
  pois: Record<string, POI[]>;
  metadata: {
    totalTiles: number;
    cachedTiles: number;
    computedTiles: number;
    totalPoints: number;
    computeTimeMs: number;
    poiTileCount: number;
    poiCounts: Record<string, number>;
    dataSource: POIDataSource;
    l1CacheStats?: {
      heatmap: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
      poi: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
    };
  };
}

interface TileCacheCheckResult {
  tile: TileCoord;
  cacheKey: string;
  cached: HeatmapTileCacheEntry | null;
}

// ============================================================================
// Request Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const stopTotalTimer = createTimer('heatmap:api:total');
  const startTime = performance.now();

  try {
    // Parse and validate request
    const body: BatchHeatmapRequest = await request.json();
    const validationError = validateRequest(body);
    if (validationError) return validationError;

    const { 
      tiles,
      factors: requestFactors, 
      distanceCurve = 'log',
      sensitivity = 1,
      normalizeToViewport = false,
      dataSource: requestedDataSource,
      poiBufferScale = POI_TILE_CONFIG.DEFAULT_POI_BUFFER_SCALE,
      viewportBounds,
    } = body;

    const useMsgpack = acceptsMsgpack(request);
    const dataSource: POIDataSource = requestedDataSource || DEFAULT_DATA_SOURCE;
    
    // Use provided factors or defaults, validate enabled factors
    const factorResult = getValidatedFactors(requestFactors);
    if (factorResult instanceof Response) {
      return factorResult;
    }
    const { factors, enabledFactors } = factorResult;

    const configHash = hashHeatmapConfig({ factors, distanceCurve, sensitivity });
    const tileCoords: TileCoord[] = tiles.map(t => ({ z: t.z, x: t.x, y: t.y }));

    // Step 1: Parallel cache check for all tiles
    const stopCacheCheckTimer = createTimer('heatmap:api:cache-check');
    const { cachedResults, uncachedTiles } = await checkHeatmapCacheParallel(tileCoords, configHash);
    stopCacheCheckTimer({ 
      total: tiles.length, 
      cached: Object.keys(cachedResults).length, 
      uncached: uncachedTiles.length 
    });

    // Step 2: Fetch POIs (needed for both cached and uncached tiles for display)
    const maxDistance = Math.max(...enabledFactors.map(f => f.maxDistance));
    const poiTiles = getPoiTilesForHeatmapTiles(
      uncachedTiles.length > 0 ? uncachedTiles : tileCoords,
      maxDistance,
      poiBufferScale
    );

    const stopPoiFetchTimer = createTimer('heatmap:api:poi-fetch');
    const poiData = await getPoiTilesForArea(
      poiTiles,
      enabledFactors.map(f => ({ id: f.id, osmTags: f.osmTags })),
      dataSource
    );
    stopPoiFetchTimer({ poiTiles: poiTiles.length, factors: enabledFactors.length });

    // Step 3: Compute uncached tiles
    let computedResults: Record<string, { points: HeatmapPoint[]; cached: boolean }> = {};
    
    if (uncachedTiles.length > 0) {
      const stopScoringTimer = createTimer('heatmap:api:scoring');
      computedResults = await computeUncachedTiles(
        uncachedTiles,
        poiData,
        enabledFactors,
        configHash,
        distanceCurve as 'linear' | 'log' | 'exp' | 'power',
        sensitivity,
        normalizeToViewport,
        dataSource
      );
      stopScoringTimer({ tiles: uncachedTiles.length });
    }

    // Step 4: Build response
    const allResults = { ...cachedResults, ...computedResults };
    const totalPoints = Object.values(allResults).reduce((sum, r) => sum + r.points.length, 0);
    const viewportPois = viewportBounds 
      ? filterPoisToViewport(poiData, viewportBounds)
      : Object.fromEntries(poiData);
    
    const poiCounts: Record<string, number> = {};
    for (const [factorId, pois] of poiData) {
      poiCounts[factorId] = pois.length;
    }

    const endTime = performance.now();
    stopTotalTimer({ 
      tiles: tiles.length, 
      cached: Object.keys(cachedResults).length, 
      computed: uncachedTiles.length, 
      points: totalPoints 
    });

    const responseData: BatchHeatmapResponse = {
      tiles: allResults,
      pois: viewportPois,
      metadata: {
        totalTiles: tiles.length,
        cachedTiles: Object.keys(cachedResults).length,
        computedTiles: uncachedTiles.length,
        totalPoints,
        computeTimeMs: Math.round(endTime - startTime),
        poiTileCount: poiTiles.length,
        poiCounts,
        dataSource,
        l1CacheStats: {
          heatmap: getHeatmapTileCacheStats(),
          poi: getPoiTileCacheStats(),
        },
      },
    };

    return createResponse(responseData, useMsgpack);
  } catch (error) {
    return handleApiError(error, {
      context: 'Batch heatmap API',
      errorMappings: [
        { pattern: 'No tiles provided', status: 400 },
        { pattern: 'Invalid tile coordinates', status: 400 },
        { pattern: 'No enabled factors', status: 400 },
      ],
    });
  }
}

// ============================================================================
// Validation
// ============================================================================

function validateRequest(body: BatchHeatmapRequest): NextResponse | null {
  const { tiles } = body;

  if (!tiles || !Array.isArray(tiles) || tiles.length === 0) {
    return errorResponse(new Error('No tiles provided'), 400);
  }

  for (const tile of tiles) {
    if (!isValidTileCoord(tile)) {
      return errorResponse(new Error('Invalid tile coordinates'), 400);
    }
  }

  return null;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Check heatmap cache for all tiles in parallel
 */
async function checkHeatmapCacheParallel(
  tiles: TileCoord[],
  configHash: string
): Promise<{
  cachedResults: Record<string, { points: HeatmapPoint[]; cached: boolean }>;
  uncachedTiles: TileCoord[];
}> {
  // Parallel cache lookups
  const cacheChecks = await Promise.all(
    tiles.map(async (tile): Promise<TileCacheCheckResult> => {
      const cacheKey = getHeatmapTileKey(tile.z, tile.x, tile.y, configHash);
      const cached = await getCachedHeatmapTile(cacheKey);
      return { tile, cacheKey, cached };
    })
  );

  const cachedResults: Record<string, { points: HeatmapPoint[]; cached: boolean }> = {};
  const uncachedTiles: TileCoord[] = [];

  for (const { tile, cached } of cacheChecks) {
    const tileKey = `${tile.z}:${tile.x}:${tile.y}`;
    if (cached) {
      cachedResults[tileKey] = { points: cached.points, cached: true };
    } else {
      uncachedTiles.push(tile);
    }
  }

  return { cachedResults, uncachedTiles };
}

// ============================================================================
// Heatmap Computation
// ============================================================================

/**
 * Compute heatmap for uncached tiles and cache the results
 * Processes tiles in parallel for better performance
 * Builds spatial indexes once and shares them across all tiles
 */
async function computeUncachedTiles(
  tiles: TileCoord[],
  poiData: Map<string, POI[]>,
  enabledFactors: Factor[],
  configHash: string,
  distanceCurve: 'linear' | 'log' | 'exp' | 'power',
  sensitivity: number,
  normalizeToViewport: boolean,
  dataSource: POIDataSource
): Promise<Record<string, { points: HeatmapPoint[]; cached: boolean }>> {
  const gridSize = calculateTileGridSize();

  // Build spatial indexes ONCE for all tiles (major optimization)
  const sharedSpatialIndexes = buildSpatialIndexes(poiData, enabledFactors);

  const results: Record<string, { points: HeatmapPoint[]; cached: boolean }> = {};

  // Process tiles in parallel for better performance
  const tilePromises = tiles.map(async (tile) => {
    const tileBounds = tileToBounds(tile.z, tile.x, tile.y);
    
    if (!isValidBounds(tileBounds)) {
      console.error(`Invalid bounds for tile ${tile.z}:${tile.x}:${tile.y}`);
      return null;
    }

    const heatmapPoints = await calculateHeatmapParallel(
      tileBounds,
      poiData,
      enabledFactors,
      gridSize,
      distanceCurve,
      sensitivity,
      normalizeToViewport,
      sharedSpatialIndexes  // Pass pre-built indexes
    );

    const tileKey = `${tile.z}:${tile.x}:${tile.y}`;

    // Cache the result (fire-and-forget)
    const cacheKey = getHeatmapTileKey(tile.z, tile.x, tile.y, configHash);
    setCachedHeatmapTile(cacheKey, {
      points: heatmapPoints,
      pois: {},
      metadata: {
        gridSize,
        pointCount: heatmapPoints.length,
        computeTimeMs: 0,
        factorCount: enabledFactors.length,
        dataSource,
        poiCounts: {},
      },
      fetchedAt: new Date().toISOString(),
    }).catch(err => console.error('Failed to cache heatmap tile:', err));

    return { tileKey, points: heatmapPoints };
  });

  // Wait for all tiles to complete
  const tileResults = await Promise.all(tilePromises);

  // Collect results
  for (const result of tileResults) {
    if (result) {
      results[result.tileKey] = { points: result.points, cached: false };
    }
  }

  return results;
}
