import { NextRequest, NextResponse } from 'next/server';
import { fetchOtodomProperties } from '@/extensions/real-estate/lib';
import { PropertyRequest, DEFAULT_PROPERTY_FILTERS } from '@/extensions/real-estate/types';
import { isValidBounds } from '@/lib/geo';
import { errorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/properties
 * Fetch properties from Otodom for the given bounds and filters
 */
export async function POST(request: NextRequest) {
  try {
    const body: PropertyRequest = await request.json();
    const { bounds, filters: requestFilters } = body;

    // Validate bounds
    if (!bounds || !isValidBounds(bounds)) {
      return errorResponse(new Error('Invalid bounds: Please provide valid map bounds'), 400);
    }

    // Merge with default filters
    const filters = {
      ...DEFAULT_PROPERTY_FILTERS,
      ...requestFilters,
    };

    // Validate required filter fields
    if (!filters.transaction || !filters.estate) {
      return errorResponse(new Error('Invalid filters: Transaction and estate type are required'), 400);
    }

    // Fetch properties from Otodom
    const result = await fetchOtodomProperties(bounds, filters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Properties API error:', error);

    // Check if it's an Otodom API error
    if (error instanceof Error && error.message.includes('Otodom API error')) {
      return errorResponse(error, 502);
    }

    return errorResponse(error);
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
