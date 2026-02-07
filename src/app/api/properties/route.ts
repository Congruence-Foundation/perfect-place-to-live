import { NextRequest, NextResponse } from 'next/server';
import { createMultiSource } from '@/extensions/real-estate/lib/shared';
import type { UnifiedSearchParams, UnifiedEstateType } from '@/extensions/real-estate/lib/shared';
import type { PropertyDataSource } from '@/extensions/real-estate/config';
import { PropertyFilters, DEFAULT_PROPERTY_FILTERS } from '@/extensions/real-estate/types';
import { fromOtodomRoomCount } from '@/extensions/real-estate/lib/otodom';
import { isValidBounds, tileToBounds } from '@/lib/geo';
import { hashFilters } from '@/lib/geo/tiles';
import { getCachedTile, setCachedTile, generateTileCacheKey, type TileCacheEntry } from '@/lib/tile-cache';
import { errorResponse, handleApiError, isValidTileCoord } from '@/lib/api-utils';
import { createTimer } from '@/lib/profiling';
import type { Bounds } from '@/types/poi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Extended request body that supports both bounds and tile coordinates
 */
interface ExtendedPropertyRequest {
  bounds?: Bounds;
  tile?: {
    z: number;
    x: number;
    y: number;
  };
  filters?: Partial<PropertyFilters>;
  /** Data sources to fetch from (defaults to ['otodom']) */
  dataSources?: PropertyDataSource[];
}

/**
 * Convert PropertyFilters to UnifiedSearchParams
 */
function toUnifiedSearchParams(
  bounds: Bounds,
  filters: PropertyFilters
): UnifiedSearchParams {
  // filters.estate is already OtodomEstateType[] which matches UnifiedEstateType
  const propertyTypes = filters.estate as UnifiedEstateType[];

  // Map room counts from string enum to numbers using the shared converter
  const rooms = filters.roomsNumber?.map(fromOtodomRoomCount);

  return {
    bounds,
    transaction: filters.transaction,
    propertyTypes,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    areaMin: filters.areaMin,
    areaMax: filters.areaMax,
    rooms,
    market: filters.market,
    owner: filters.ownerType,
    // Advanced filters
    buildYearMin: filters.buildYearMin,
    buildYearMax: filters.buildYearMax,
    pricePerMeterMin: filters.pricePerMeterMin,
    pricePerMeterMax: filters.pricePerMeterMax,
    buildingMaterial: filters.buildingMaterial,
    extras: filters.extras,
    description: filters.description,
    daysSinceCreated: filters.daysSinceCreated,
    floors: filters.floors,
    floorsNumberMin: filters.floorsNumberMin,
    floorsNumberMax: filters.floorsNumberMax,
    flatBuildingType: filters.flatBuildingType,
    terrainAreaMin: filters.terrainAreaMin,
    terrainAreaMax: filters.terrainAreaMax,
    houseBuildingType: filters.houseBuildingType,
    isBungalow: filters.isBungalow,
  };
}

/**
 * POST /api/properties
 * Fetch properties from configured data sources for the given bounds or tile coordinates
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
    // Parse request body with error handling for empty/malformed JSON
    let body: ExtendedPropertyRequest;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return errorResponse(new Error('Request body is empty'), 400);
      }
      body = JSON.parse(text);
    } catch {
      // This can happen when the request is aborted mid-flight
      return errorResponse(new Error('Invalid JSON in request body'), 400);
    }
    
    const { 
      bounds: requestBounds, 
      tile, 
      filters: requestFilters,
      dataSources = ['otodom'],
    } = body;

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

    if (isValidTileCoord(tile)) {
      // Tile-based request
      bounds = tileToBounds(tile.z, tile.x, tile.y);
      // Include data sources in cache key by appending to filter hash
      const baseFilterHash = hashFilters(filters);
      const filterHash = `${baseFilterHash}-${[...dataSources].sort().join(',')}`;
      cacheKey = generateTileCacheKey(tile.z, tile.x, tile.y, filterHash);

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

    // Create data source (single or multi-source)
    const stopFetchTimer = createTimer('properties-api:fetch');
    const dataSource = await createMultiSource(dataSources);
    
    // Convert filters to unified format
    const searchParams = toUnifiedSearchParams(bounds, filters);
    
    // Fetch properties
    const result = await dataSource.searchProperties(searchParams);
    
    stopFetchTimer({ 
      properties: result.properties.length, 
      clusters: result.clusters?.length || 0,
      sources: dataSources.join(','),
    });

    // Cache tile requests (cacheKey is only set for tile requests)
    if (cacheKey) {
      const cacheEntry: TileCacheEntry = {
        properties: result.properties,
        clusters: result.clusters || [],
        totalCount: result.totalCount,
        fetchedAt: new Date().toISOString(),
      };
      
      // Don't await - cache in background, but handle errors
      setCachedTile(cacheKey, cacheEntry).catch(err => 
        console.error('Failed to cache property tile:', err)
      );
    }

    stopTotalTimer({ 
      cached: false, 
      properties: result.properties.length, 
      clusters: result.clusters?.length || 0,
      sources: dataSources.join(','),
    });
    
    return NextResponse.json({
      ...result,
      cached: false,
    });
  } catch (error) {
    return handleApiError(error, {
      context: 'Properties API',
      errorMappings: [
        { pattern: 'API error', status: 502 },
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
