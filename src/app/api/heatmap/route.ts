import { NextRequest, NextResponse } from 'next/server';
import { encode } from '@msgpack/msgpack';
import { fetchPoisWithFallback, DataSource } from '@/lib/poi';
import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
import { DEFAULT_FACTORS, getEnabledFactors } from '@/config/factors';
import { Factor, POI, HeatmapRequest } from '@/types';
import { estimateGridSize, calculateAdaptiveGridSize, expandBounds, isValidBounds, filterPoisToBounds } from '@/lib/geo';
import { errorResponse } from '@/lib/api-utils';
import { PERFORMANCE_CONFIG } from '@/constants/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { 
  POI_BUFFER_DEGREES,
  MAX_GRID_POINTS,
  DEFAULT_DATA_SOURCE,
  TARGET_GRID_POINTS,
  MIN_CELL_SIZE,
  MAX_CELL_SIZE,
  FALLBACK_MIN_CELL_SIZE,
  FALLBACK_MAX_CELL_SIZE,
  MAX_GRID_POINTS_TOLERANCE,
  GRID_BUFFER_DEGREES,
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
    const enabledFactors = getEnabledFactors(factors);

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

    // Fetch POIs with automatic fallback from Neon to Overpass
    const factorDefs = enabledFactors.map(f => ({ id: f.id, osmTags: f.osmTags }));
    const { poiData, actualDataSource } = await fetchPoisWithFallback(
      factorDefs,
      poiBounds,
      dataSource
    );

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
    const poisByFactor = filterPoisToBounds(poiData, poiBounds);

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
