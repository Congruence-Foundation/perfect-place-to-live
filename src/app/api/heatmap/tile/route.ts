import { NextRequest } from 'next/server';
import { fetchPOIsWithFallback, type POIDataSource } from '@/lib/poi';
import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
import type { Factor } from '@/types';
import { tileToBounds, expandBounds, isValidBounds, filterPoisToBounds, calculateTileGridSize } from '@/lib/geo';
import { getHeatmapTileKey, hashHeatmapConfig } from '@/lib/geo/tiles';
import { getCachedHeatmapTile, setCachedHeatmapTile } from '@/lib/heatmap-tile-cache';
import { errorResponse, createResponse, acceptsMsgpack, getValidatedFactors, isValidTileCoord, handleApiError } from '@/lib/api-utils';
import { PERFORMANCE_CONFIG } from '@/constants/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { 
  POI_BUFFER_DEGREES,
  DEFAULT_DATA_SOURCE,
} = PERFORMANCE_CONFIG;

/**
 * Request body for heatmap tile endpoint
 */
interface HeatmapTileRequest {
  tile: {
    z: number;
    x: number;
    y: number;
  };
  factors?: Factor[];
  distanceCurve?: string;
  sensitivity?: number;
  lambda?: number;
  normalizeToViewport?: boolean;
  dataSource?: POIDataSource;
}

export async function POST(request: NextRequest) {
  try {
    const body: HeatmapTileRequest = await request.json();
    const { 
      tile,
      factors: requestFactors, 
      distanceCurve = 'log',
      sensitivity = 1,
      lambda,
      normalizeToViewport = false,
      dataSource: requestedDataSource,
    } = body;

    // Validate tile coordinates
    if (!isValidTileCoord(tile)) {
      return errorResponse(new Error('Invalid tile coordinates'), 400);
    }

    // Check if client wants MessagePack format
    const useMsgpack = acceptsMsgpack(request);

    // Determine data source
    const dataSource: POIDataSource = requestedDataSource || DEFAULT_DATA_SOURCE;

    // Use provided factors or defaults, validate enabled factors
    const factorResult = getValidatedFactors(requestFactors);
    if (factorResult instanceof Response) {
      return factorResult;
    }
    const { factors, enabledFactors } = factorResult;

    // Generate config hash for cache key
    const configHash = hashHeatmapConfig({
      factors,
      distanceCurve,
      sensitivity,
      lambda,
    });

    // Generate cache key
    const cacheKey = getHeatmapTileKey(tile.z, tile.x, tile.y, configHash);

    // Check cache first
    const cached = await getCachedHeatmapTile(cacheKey);
    if (cached) {
      const responseData = {
        points: cached.points,
        pois: cached.pois,
        metadata: {
          ...cached.metadata,
          cached: true,
        },
      };

      return createResponse(responseData, useMsgpack);
    }

    const startTime = performance.now();

    // Convert tile to bounds
    const tileBounds = tileToBounds(tile.z, tile.x, tile.y);

    // Validate bounds
    if (!isValidBounds(tileBounds)) {
      return errorResponse(new Error('Invalid tile bounds'), 400);
    }

    // Expand bounds for POI fetching to avoid edge effects
    const poiBounds = expandBounds(tileBounds, POI_BUFFER_DEGREES);

    // Calculate adaptive grid size for this tile using configured tile size
    const gridSize = calculateTileGridSize();

    // Fetch POIs with automatic fallback from Neon to Overpass
    const factorDefs = enabledFactors.map(f => ({ id: f.id, osmTags: f.osmTags }));
    const { poiData, actualDataSource } = await fetchPOIsWithFallback(
      factorDefs,
      poiBounds,
      dataSource
    );

    // Calculate heatmap for this tile
    const heatmapPoints = await calculateHeatmapParallel(
      tileBounds,
      poiData,
      enabledFactors,
      gridSize,
      distanceCurve as 'linear' | 'log' | 'exp' | 'power',
      sensitivity,
      lambda,
      normalizeToViewport
    );

    const endTime = performance.now();

    // Filter POIs to tile bounds (with buffer for edge display)
    const poisByFactor = filterPoisToBounds(poiData, poiBounds);

    const metadata = {
      gridSize,
      pointCount: heatmapPoints.length,
      computeTimeMs: Math.round(endTime - startTime),
      factorCount: enabledFactors.length,
      dataSource: actualDataSource,
      poiCounts: Object.fromEntries(
        Array.from(poiData.entries()).map(([id, pois]) => [id, pois.length])
      ),
    };

    // Cache the result
    await setCachedHeatmapTile(cacheKey, {
      points: heatmapPoints,
      pois: poisByFactor,
      metadata,
      fetchedAt: new Date().toISOString(),
    });

    const responseData = {
      points: heatmapPoints,
      pois: poisByFactor,
      metadata: {
        ...metadata,
        cached: false,
      },
    };

    return createResponse(responseData, useMsgpack);
  } catch (error) {
    return handleApiError(error, { context: 'Heatmap tile API' });
  }
}
