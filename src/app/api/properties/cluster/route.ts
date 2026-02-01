import { NextRequest, NextResponse } from 'next/server';
import { fetchClusterProperties } from '@/lib/otodom';
import { PropertyFilters, DEFAULT_PROPERTY_FILTERS } from '@/types/property';
import { errorResponse } from '@/lib/api-utils';
import { CLUSTER_CONFIG } from '@/constants/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClusterRequest {
  lat: number;
  lng: number;
  filters?: Partial<PropertyFilters>;
  page?: number;
  limit?: number;
  shape?: string; // GeoJSON polygon string (preferred)
  radius?: number; // Fallback radius in meters
  estateType?: string; // Specific estate type for this cluster
}

/**
 * POST /api/properties/cluster
 * Fetch individual properties within a cluster area
 */
export async function POST(request: NextRequest) {
  try {
    const body: ClusterRequest = await request.json();
    const { 
      lat, 
      lng, 
      filters: partialFilters, 
      page = CLUSTER_CONFIG.DEFAULT_PAGE, 
      limit = CLUSTER_CONFIG.DEFAULT_LIMIT, 
      shape, 
      radius = CLUSTER_CONFIG.DEFAULT_RADIUS_METERS, 
      estateType 
    } = body;

    // Validate required fields
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return errorResponse(new Error('Invalid coordinates: lat and lng are required'), 400);
    }

    // Merge with default filters
    const filters: PropertyFilters = {
      ...DEFAULT_PROPERTY_FILTERS,
      ...partialFilters,
    };

    const result = await fetchClusterProperties(
      lat,
      lng,
      filters,
      page,
      limit,
      shape,
      radius,
      estateType
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Cluster properties API error:', error);
    // Return more specific error message
    const message = error instanceof Error ? error.message : 'Failed to fetch cluster properties';
    return errorResponse(new Error(message), 500);
  }
}
