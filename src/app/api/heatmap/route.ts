import { NextRequest, NextResponse } from 'next/server';
import { fetchPOIsWithFallback, type POIDataSource } from '@/lib/poi';
import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
import type { HeatmapRequest } from '@/types';
import { estimateGridSize, calculateAdaptiveGridSize, expandBounds, isValidBounds, filterPoisToBounds } from '@/lib/geo';
import { errorResponse, createResponse, acceptsMsgpack, getValidatedFactors, handleApiError } from '@/lib/api-utils';
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
    const useMsgpack = acceptsMsgpack(request);

    // Determine data source (default to Neon for performance)
    const dataSource: POIDataSource = requestedDataSource || DEFAULT_DATA_SOURCE;

    // Validate bounds
    if (!isValidBounds(bounds)) {
      return errorResponse(new Error('Invalid bounds'), 400);
    }

    // Use provided factors or defaults, validate enabled factors
    const factorResult = getValidatedFactors(requestFactors);
    if (factorResult instanceof Response) {
      return factorResult;
    }
    const { enabledFactors } = factorResult;

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
    const { poiData, actualDataSource } = await fetchPOIsWithFallback(
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

    return createResponse(responseData, useMsgpack);
  } catch (error) {
    return handleApiError(error, {
      context: 'Heatmap API',
      errorMappings: [
        { pattern: 'Invalid bounds', status: 400 },
        { pattern: 'No enabled factors', status: 400 },
      ],
    });
  }
}
