import { NextRequest, NextResponse } from 'next/server';
import { encode } from '@msgpack/msgpack';
import { generatePOICacheKey, fetchPOIs, DataSource } from '@/lib/poi';
import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import { Factor, POI } from '@/types';
import { tileToBounds, expandBounds, isValidBounds } from '@/lib/geo';
import { getHeatmapTileKey, hashHeatmapConfig } from '@/lib/geo/tiles';
import { getCachedHeatmapTile, setCachedHeatmapTile } from '@/lib/heatmap-tile-cache';
import { errorResponse } from '@/lib/api-utils';
import { PERFORMANCE_CONFIG, HEATMAP_TILE_CONFIG } from '@/constants/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { 
  POI_BUFFER_DEGREES,
  POI_CACHE_TTL_SECONDS,
  DEFAULT_DATA_SOURCE,
  TARGET_GRID_POINTS,
  MIN_CELL_SIZE,
  MAX_CELL_SIZE,
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
  normalizeToViewport?: boolean;
  dataSource?: DataSource;
}

export async function POST(request: NextRequest) {
  try {
    const body: HeatmapTileRequest = await request.json();
    const { 
      tile,
      factors: requestFactors, 
      distanceCurve = 'log',
      sensitivity = 1,
      normalizeToViewport = false,
      dataSource: requestedDataSource,
    } = body;

    // Validate tile coordinates
    if (!tile || typeof tile.z !== 'number' || typeof tile.x !== 'number' || typeof tile.y !== 'number') {
      return errorResponse(new Error('Invalid tile coordinates'), 400);
    }

    // Check if client wants MessagePack format
    const acceptsMsgpack = request.headers.get('Accept') === 'application/msgpack';

    // Determine data source
    const dataSource: DataSource = requestedDataSource || DEFAULT_DATA_SOURCE;

    // Use provided factors or defaults
    const factors: Factor[] = requestFactors || DEFAULT_FACTORS;
    const enabledFactors = factors.filter((f) => f.enabled && f.weight !== 0);

    if (enabledFactors.length === 0) {
      return errorResponse(new Error('No enabled factors'), 400);
    }

    // Generate config hash for cache key
    const configHash = hashHeatmapConfig({
      factors,
      distanceCurve,
      sensitivity,
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

      if (acceptsMsgpack) {
        const encoded = encode(responseData);
        return new Response(encoded, {
          headers: { 'Content-Type': 'application/msgpack' },
        });
      }

      return NextResponse.json(responseData);
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

    // Calculate adaptive grid size for this tile
    // Tiles at zoom 12 are ~4.8km x 4.8km, so we use a reasonable grid size
    const tileWidthMeters = 4800; // Approximate at Poland's latitude
    const gridSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, tileWidthMeters / Math.sqrt(TARGET_GRID_POINTS / 4)));

    // Fetch POIs
    const poiData = new Map<string, POI[]>();
    const uncachedFactors: { id: string; osmTags: string[] }[] = [];
    let actualDataSource: DataSource = dataSource;

    if (dataSource === 'neon') {
      // Check cache first for Neon
      for (const factor of enabledFactors) {
        const poiCacheKey = generatePOICacheKey(factor.id, poiBounds);
        const cachedPOIs = await cacheGet<POI[]>(poiCacheKey);
        
        if (cachedPOIs) {
          poiData.set(factor.id, cachedPOIs);
        } else {
          uncachedFactors.push({ id: factor.id, osmTags: factor.osmTags });
        }
      }
    } else {
      for (const factor of enabledFactors) {
        uncachedFactors.push({ id: factor.id, osmTags: factor.osmTags });
      }
    }

    // Fetch uncached POIs
    if (uncachedFactors.length > 0) {
      try {
        const fetchedPOIs = await fetchPOIs(uncachedFactors, poiBounds, actualDataSource);
        
        const totalPOIs = Object.values(fetchedPOIs).reduce((sum, pois) => sum + pois.length, 0);
        
        if (actualDataSource === 'neon' && totalPOIs === 0) {
          // Fallback to Overpass
          console.log('No POIs found in Neon DB for tile, falling back to Overpass API...');
          actualDataSource = 'overpass';
          
          try {
            const overpassPOIs = await fetchPOIs(uncachedFactors, poiBounds, 'overpass');
            
            for (const [factorId, pois] of Object.entries(overpassPOIs)) {
              poiData.set(factorId, pois);
              const poiCacheKey = generatePOICacheKey(factorId, poiBounds);
              await cacheSet(poiCacheKey, pois, POI_CACHE_TTL_SECONDS);
            }
          } catch (overpassError) {
            console.error('Overpass fallback failed:', overpassError);
            for (const factor of uncachedFactors) {
              if (!poiData.has(factor.id)) {
                poiData.set(factor.id, []);
              }
            }
          }
        } else {
          for (const [factorId, pois] of Object.entries(fetchedPOIs)) {
            poiData.set(factorId, pois);
            const poiCacheKey = generatePOICacheKey(factorId, poiBounds);
            await cacheSet(poiCacheKey, pois, POI_CACHE_TTL_SECONDS);
          }
        }
      } catch (error) {
        console.error(`Error fetching POIs from ${actualDataSource}:`, error);
        
        if (actualDataSource === 'neon') {
          console.log('Neon DB error, falling back to Overpass API...');
          actualDataSource = 'overpass';
          
          try {
            const overpassPOIs = await fetchPOIs(uncachedFactors, poiBounds, 'overpass');
            
            for (const [factorId, pois] of Object.entries(overpassPOIs)) {
              poiData.set(factorId, pois);
              const poiCacheKey = generatePOICacheKey(factorId, poiBounds);
              await cacheSet(poiCacheKey, pois, POI_CACHE_TTL_SECONDS);
            }
          } catch (overpassError) {
            console.error('Overpass fallback failed:', overpassError);
            for (const factor of uncachedFactors) {
              if (!poiData.has(factor.id)) {
                poiData.set(factor.id, []);
              }
            }
          }
        } else {
          for (const factor of uncachedFactors) {
            if (!poiData.has(factor.id)) {
              poiData.set(factor.id, []);
            }
          }
        }
      }
    }

    // Calculate heatmap for this tile
    const heatmapPoints = await calculateHeatmapParallel(
      tileBounds,
      poiData,
      enabledFactors,
      gridSize,
      distanceCurve as 'linear' | 'log' | 'exp' | 'power',
      sensitivity,
      normalizeToViewport
    );

    const endTime = performance.now();

    // Filter POIs to tile bounds (with buffer for edge display)
    const poisByFactor: Record<string, POI[]> = {};
    poiData.forEach((pois, factorId) => {
      poisByFactor[factorId] = pois.filter(
        (poi) =>
          poi.lat >= poiBounds.south &&
          poi.lat <= poiBounds.north &&
          poi.lng >= poiBounds.west &&
          poi.lng <= poiBounds.east
      );
    });

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

    if (acceptsMsgpack) {
      const encoded = encode(responseData);
      return new Response(encoded, {
        headers: { 'Content-Type': 'application/msgpack' },
      });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Heatmap tile API error:', error);
    return errorResponse(error);
  }
}
