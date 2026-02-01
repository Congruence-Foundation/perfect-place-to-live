import { NextRequest, NextResponse } from 'next/server';
import { encode } from '@msgpack/msgpack';
import { generatePOICacheKey, fetchPOIs, DataSource } from '@/lib/poi';
import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import { Factor, POI, HeatmapRequest } from '@/types';
import { estimateGridSize, calculateAdaptiveGridSize, expandBounds, isValidBounds } from '@/lib/geo';
import { errorResponse } from '@/lib/api-utils';
import { PERFORMANCE_CONFIG } from '@/constants/performance';
import { GRID_BUFFER_DEGREES } from '@/constants/heatmap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { 
  POI_BUFFER_DEGREES,
  MAX_GRID_POINTS,
  POI_CACHE_TTL_SECONDS,
  DEFAULT_DATA_SOURCE,
  TARGET_GRID_POINTS,
  MIN_CELL_SIZE,
  MAX_CELL_SIZE,
  FALLBACK_MIN_CELL_SIZE,
  FALLBACK_MAX_CELL_SIZE,
  MAX_GRID_POINTS_TOLERANCE,
} = PERFORMANCE_CONFIG;

export async function POST(request: NextRequest) {
  try {
    const body: HeatmapRequest = await request.json();
    const { 
      bounds, 
      factors: requestFactors, 
      gridSize, 
      distanceCurve, 
      sensitivity, 
      normalizeToViewport,
      dataSource: requestedDataSource,
    } = body;

    // Check if client wants MessagePack format (~30% smaller than JSON)
    const acceptsMsgpack = request.headers.get('Accept') === 'application/msgpack';

    // Determine data source (default to Neon for performance)
    const dataSource: DataSource = requestedDataSource || DEFAULT_DATA_SOURCE;

    // Validate bounds
    if (!isValidBounds(bounds)) {
      return errorResponse(new Error('Invalid bounds'), 400);
    }

    // Use provided factors or defaults
    const factors: Factor[] = requestFactors || DEFAULT_FACTORS;
    const enabledFactors = factors.filter((f) => f.enabled && f.weight !== 0);

    if (enabledFactors.length === 0) {
      return errorResponse(new Error('No enabled factors'), 400);
    }

    // Expand bounds for grid/canvas to extend beyond viewport (prevents reload on small scrolls)
    const gridBounds = expandBounds(bounds, GRID_BUFFER_DEGREES);

    // Calculate effective grid size using expanded grid bounds
    // If user specified a grid size, check if it would generate too many points
    // If so, automatically increase the grid size to stay within limits
    let effectiveGridSize = gridSize || calculateAdaptiveGridSize(gridBounds, TARGET_GRID_POINTS, MIN_CELL_SIZE, MAX_CELL_SIZE);
    let estimatedPoints = estimateGridSize(gridBounds, effectiveGridSize);

    // If too many points, increase grid size to stay within limits
    if (estimatedPoints > MAX_GRID_POINTS) {
      // Calculate the minimum grid size needed to stay under the limit
      effectiveGridSize = calculateAdaptiveGridSize(gridBounds, MAX_GRID_POINTS, FALLBACK_MIN_CELL_SIZE, FALLBACK_MAX_CELL_SIZE);
      estimatedPoints = estimateGridSize(gridBounds, effectiveGridSize);
      
      // If still too many points even with max grid size, reject
      if (estimatedPoints > MAX_GRID_POINTS * MAX_GRID_POINTS_TOLERANCE) {
        return NextResponse.json(
          { 
            error: 'Viewport too large',
            message: `Please zoom in to see the heatmap.`,
            estimatedPoints,
            maxPoints: MAX_GRID_POINTS,
          },
          { status: 400 }
        );
      }
    }

    const startTime = performance.now();
    
    // Expand bounds even more for POI fetching to avoid edge effects
    const poiBounds = expandBounds(bounds, POI_BUFFER_DEGREES);

    // Check cache for all factors first (using POI bounds) - only for Neon source
    // Overpass has its own caching behavior
    const poiData = new Map<string, POI[]>();
    const uncachedFactors: { id: string; osmTags: string[] }[] = [];
    
    // Track actual data source used (may change if fallback occurs)
    let actualDataSource: DataSource = dataSource;

    if (dataSource === 'neon') {
      // For Neon, check cache first
      for (const factor of enabledFactors) {
        const cacheKey = generatePOICacheKey(factor.id, poiBounds);
        const cached = await cacheGet<POI[]>(cacheKey);
        
        if (cached) {
          poiData.set(factor.id, cached);
        } else {
          uncachedFactors.push({ id: factor.id, osmTags: factor.osmTags });
        }
      }
    } else {
      // For Overpass, always fetch fresh data
      for (const factor of enabledFactors) {
        uncachedFactors.push({ id: factor.id, osmTags: factor.osmTags });
      }
    }

    // Fetch uncached POIs using the unified POI service
    if (uncachedFactors.length > 0) {
      try {
        const fetchedPOIs = await fetchPOIs(uncachedFactors, poiBounds, actualDataSource);
        
        // Check if Neon returned empty results - might need to fallback to Overpass
        const totalPOIs = Object.values(fetchedPOIs).reduce((sum, pois) => sum + pois.length, 0);
        
        if (actualDataSource === 'neon' && totalPOIs === 0) {
          // No data in Neon DB for this area - try Overpass as fallback
          console.log('No POIs found in Neon DB, falling back to Overpass API...');
          actualDataSource = 'overpass';
          
          try {
            const overpassPOIs = await fetchPOIs(uncachedFactors, poiBounds, 'overpass');
            
            // Store Overpass results
            for (const [factorId, pois] of Object.entries(overpassPOIs)) {
              poiData.set(factorId, pois);
              // Cache the results for future requests
              const cacheKey = generatePOICacheKey(factorId, poiBounds);
              await cacheSet(cacheKey, pois, POI_CACHE_TTL_SECONDS);
            }
          } catch (overpassError) {
            console.error('Overpass fallback also failed:', overpassError);
            // Initialize empty arrays for failed factors
            for (const factor of uncachedFactors) {
              if (!poiData.has(factor.id)) {
                poiData.set(factor.id, []);
              }
            }
          }
        } else {
          // Store in cache and add to poiData
          for (const [factorId, pois] of Object.entries(fetchedPOIs)) {
            poiData.set(factorId, pois);
            // Cache the results (useful for both sources)
            const cacheKey = generatePOICacheKey(factorId, poiBounds);
            await cacheSet(cacheKey, pois, POI_CACHE_TTL_SECONDS);
          }
        }
      } catch (error) {
        console.error(`Error fetching POIs from ${actualDataSource}:`, error);
        
        // If Neon failed, try Overpass as fallback
        if (actualDataSource === 'neon') {
          console.log('Neon DB error, falling back to Overpass API...');
          actualDataSource = 'overpass';
          
          try {
            const overpassPOIs = await fetchPOIs(uncachedFactors, poiBounds, 'overpass');
            
            for (const [factorId, pois] of Object.entries(overpassPOIs)) {
              poiData.set(factorId, pois);
              const cacheKey = generatePOICacheKey(factorId, poiBounds);
              await cacheSet(cacheKey, pois, POI_CACHE_TTL_SECONDS);
            }
          } catch (overpassError) {
            console.error('Overpass fallback also failed:', overpassError);
            // Initialize empty arrays for failed factors
            for (const factor of uncachedFactors) {
              if (!poiData.has(factor.id)) {
                poiData.set(factor.id, []);
              }
            }
          }
        } else {
          // Initialize empty arrays for failed factors
          for (const factor of uncachedFactors) {
            if (!poiData.has(factor.id)) {
              poiData.set(factor.id, []);
            }
          }
        }
      }
    }

    // Calculate heatmap using expanded grid bounds (extends beyond viewport)
    const heatmapPoints = await calculateHeatmapParallel(
      gridBounds,
      poiData,
      enabledFactors,
      effectiveGridSize,
      distanceCurve || 'log',
      sensitivity || 1,
      normalizeToViewport || false
    );

    const endTime = performance.now();

    // Convert POI data to plain object for response
    // Use expanded poiBounds (not viewport bounds) so POIs extend beyond visible area
    // This prevents POIs from disappearing at edges when panning
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

    const responseData = {
      points: heatmapPoints,
      pois: poisByFactor,
      metadata: {
        gridSize: gridSize || 'adaptive',
        pointCount: heatmapPoints.length,
        computeTimeMs: Math.round(endTime - startTime),
        factorCount: enabledFactors.length,
        dataSource: actualDataSource,
        poiCounts: Object.fromEntries(
          Array.from(poiData.entries()).map(([id, pois]) => [id, pois.length])
        ),
      },
    };

    // Return MessagePack format if requested (~30% smaller than JSON)
    if (acceptsMsgpack) {
      const encoded = encode(responseData);
      return new Response(encoded, {
        headers: {
          'Content-Type': 'application/msgpack',
        },
      });
    }

    // Default to JSON response
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Heatmap API error:', error);
    return errorResponse(error);
  }
}
