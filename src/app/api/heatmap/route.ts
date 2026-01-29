import { NextRequest, NextResponse } from 'next/server';
import { fetchAllPOIsCombined, generatePOICacheKey } from '@/lib/overpass';
import { calculateHeatmapParallel } from '@/lib/calculator-parallel';
import { cacheGet, cacheSet } from '@/lib/cache';
import { DEFAULT_FACTORS } from '@/config/factors';
import { Bounds, Factor, POI, HeatmapRequest, DistanceCurve } from '@/types';
import { estimateGridSize, calculateAdaptiveGridSize } from '@/lib/grid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Buffer distance in degrees (approximately 3km at mid-latitudes)
// This ensures POIs just outside the viewport are included for edge calculations
const POI_BUFFER_DEGREES = 0.03;

// Maximum allowed grid points to prevent server overload
const MAX_GRID_POINTS = 50000;

/**
 * Expand bounds by a buffer to fetch POIs outside the visible area
 * This prevents edge effects where grid points near borders have artificially high K values
 */
function expandBounds(bounds: Bounds, buffer: number): Bounds {
  return {
    north: bounds.north + buffer,
    south: bounds.south - buffer,
    east: bounds.east + buffer,
    west: bounds.west - buffer,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: HeatmapRequest = await request.json();
    const { bounds, factors: requestFactors, gridSize, distanceCurve, sensitivity, normalizeToViewport } = body;

    // Validate bounds
    if (!bounds || !bounds.north || !bounds.south || !bounds.east || !bounds.west) {
      return NextResponse.json({ error: 'Invalid bounds' }, { status: 400 });
    }

    // Use provided factors or defaults
    const factors: Factor[] = requestFactors || DEFAULT_FACTORS;
    const enabledFactors = factors.filter((f) => f.enabled && f.weight !== 0);

    if (enabledFactors.length === 0) {
      return NextResponse.json({ error: 'No enabled factors' }, { status: 400 });
    }

    // Calculate effective grid size
    // If user specified a grid size, check if it would generate too many points
    // If so, automatically increase the grid size to stay within limits
    let effectiveGridSize = gridSize || calculateAdaptiveGridSize(bounds, 5000, 100, 500);
    let estimatedPoints = estimateGridSize(bounds, effectiveGridSize);

    // If too many points, increase grid size to stay within limits
    if (estimatedPoints > MAX_GRID_POINTS) {
      // Calculate the minimum grid size needed to stay under the limit
      effectiveGridSize = calculateAdaptiveGridSize(bounds, MAX_GRID_POINTS, 50, 2000);
      estimatedPoints = estimateGridSize(bounds, effectiveGridSize);
      
      // If still too many points even with max grid size, reject
      if (estimatedPoints > MAX_GRID_POINTS * 1.5) {
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

    // Expand bounds for POI fetching to avoid edge effects
    const expandedBounds = expandBounds(bounds, POI_BUFFER_DEGREES);

    // Check cache for all factors first (using expanded bounds)
    const poiData = new Map<string, POI[]>();
    const uncachedFactors: { id: string; osmTags: string[] }[] = [];

    for (const factor of enabledFactors) {
      const cacheKey = generatePOICacheKey(factor.id, expandedBounds);
      const cached = await cacheGet<POI[]>(cacheKey);
      
      if (cached) {
        poiData.set(factor.id, cached);
      } else {
        uncachedFactors.push({ id: factor.id, osmTags: factor.osmTags });
      }
    }

    // Fetch uncached POIs in a single combined query (using expanded bounds)
    if (uncachedFactors.length > 0) {
      try {
        const fetchedPOIs = await fetchAllPOIsCombined(uncachedFactors, expandedBounds);
        
        // Store in cache and add to poiData
        for (const [factorId, pois] of Object.entries(fetchedPOIs)) {
          poiData.set(factorId, pois);
          const cacheKey = generatePOICacheKey(factorId, expandedBounds);
          await cacheSet(cacheKey, pois, 3600); // 1 hour TTL
        }
      } catch (error) {
        console.error('Error fetching POIs:', error);
        // Initialize empty arrays for failed factors
        for (const factor of uncachedFactors) {
          if (!poiData.has(factor.id)) {
            poiData.set(factor.id, []);
          }
        }
      }
    }

    // Calculate heatmap using original bounds (for grid) but expanded POI data
    const heatmapPoints = await calculateHeatmapParallel(
      bounds,
      poiData,
      enabledFactors,
      effectiveGridSize,
      distanceCurve || 'log',
      sensitivity || 1,
      normalizeToViewport || false
    );

    const endTime = performance.now();

    // Convert POI data to plain object for JSON response
    // Only include POIs within the original bounds for the response (to reduce payload)
    const poisByFactor: Record<string, POI[]> = {};
    poiData.forEach((pois, factorId) => {
      poisByFactor[factorId] = pois.filter(
        (poi) =>
          poi.lat >= bounds.south &&
          poi.lat <= bounds.north &&
          poi.lng >= bounds.west &&
          poi.lng <= bounds.east
      );
    });

    return NextResponse.json({
      points: heatmapPoints,
      pois: poisByFactor,
      metadata: {
        gridSize: gridSize || 'adaptive',
        pointCount: heatmapPoints.length,
        computeTimeMs: Math.round(endTime - startTime),
        factorCount: enabledFactors.length,
        poiCounts: Object.fromEntries(
          Array.from(poiData.entries()).map(([id, pois]) => [id, pois.length])
        ),
      },
    });
  } catch (error) {
    console.error('Heatmap API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
