import { NextRequest, NextResponse } from 'next/server';
import { fetchOtodomProperties } from '@/extensions/real-estate/lib';
import { PropertyRequest, PropertyFilters, DEFAULT_PROPERTY_FILTERS } from '@/extensions/real-estate/types';
import { isValidBounds, tileToBounds } from '@/lib/geo';
import { hashFilters } from '@/lib/geo/tiles';
import { getCachedTile, setCachedTile, generateTileCacheKey, type TileCacheEntry } from '@/lib/tile-cache';
import { errorResponse, handleApiError, isValidTileCoord } from '@/lib/api-utils';
import { createTimer } from '@/lib/profiling';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Extended request body that supports both bounds and tile coordinates
 */
interface ExtendedPropertyRequest extends PropertyRequest {
  tile?: {
    z: number;
    x: number;
    y: number;
  };
}

/**
 * POST /api/properties
 * Fetch properties from Otodom for the given bounds or tile coordinates
 * 
 * Supports two modes:
 * 1. Bounds-based: { bounds: {...}, filters: {...} }
 * 2. Tile-based: { tile: { z, x, y }, filters: {...} }
 * 
 * Tile-based requests use LRU + Redis caching for better performance
 */
export async function POST(request: NextRequest) {
  const stopTotalTimer = createTimer('properties-api:total');
  try {
    const body: ExtendedPropertyRequest = await request.json();
    const { bounds: requestBounds, tile, filters: requestFilters } = body;

    // Merge with default filters
    const filters: PropertyFilters = {
      ...DEFAULT_PROPERTY_FILTERS,
      ...requestFilters,
    };

    // Validate required filter fields
    if (!filters.transaction || !filters.estate) {
      return errorResponse(new Error('Invalid filters: Transaction and estate type are required'), 400);
    }

    // Determine bounds from either direct bounds or tile coordinates
    let bounds = requestBounds;
    let cacheKey: string | null = null;
    let isTileRequest = false;

    if (isValidTileCoord(tile)) {
      // Tile-based request
      bounds = tileToBounds(tile.z, tile.x, tile.y);
      const filterHash = hashFilters(filters);
      cacheKey = generateTileCacheKey(tile.z, tile.x, tile.y, filterHash);
      isTileRequest = true;

      // Check cache for tile requests
      const stopCacheTimer = createTimer('properties-api:cache-check');
      const cached = await getCachedTile(cacheKey);
      if (cached) {
        stopCacheTimer({ hit: true, tile: `${tile.z}:${tile.x}:${tile.y}` });
        stopTotalTimer({ cached: true, tile: `${tile.z}:${tile.x}:${tile.y}` });
        return NextResponse.json({
          ...cached,
          cached: true,
        });
      }
      stopCacheTimer({ hit: false, tile: `${tile.z}:${tile.x}:${tile.y}` });
    }

    // Validate bounds
    if (!bounds || !isValidBounds(bounds)) {
      return errorResponse(new Error('Invalid bounds: Please provide valid map bounds or tile coordinates'), 400);
    }

    // Fetch properties from Otodom
    const stopFetchTimer = createTimer('properties-api:otodom-fetch');
    const result = await fetchOtodomProperties(bounds, filters);
    stopFetchTimer({ properties: result.properties.length, clusters: result.clusters?.length || 0 });

    // Cache tile requests
    if (isTileRequest && cacheKey) {
      const cacheEntry: TileCacheEntry = {
        properties: result.properties,
        clusters: result.clusters || [],
        totalCount: result.totalCount,
        fetchedAt: new Date().toISOString(),
      };
      
      // Don't await - cache in background
      setCachedTile(cacheKey, cacheEntry);
    }

    stopTotalTimer({ cached: false, properties: result.properties.length, clusters: result.clusters?.length || 0 });
    return NextResponse.json({
      ...result,
      cached: false,
    });
  } catch (error) {
    return handleApiError(error, {
      context: 'Properties API',
      errorMappings: [
        { pattern: 'Otodom API error', status: 502 },
        { pattern: 'Invalid filters', status: 400 },
        { pattern: 'Invalid bounds', status: 400 },
      ],
    });
  }
}

/**
 * GET /api/properties
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'properties',
    timestamp: new Date().toISOString(),
  });
}
