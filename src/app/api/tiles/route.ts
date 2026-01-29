import { NextRequest, NextResponse } from 'next/server';
import { cacheGet } from '@/lib/cache';
import { tileToBounds } from '@/lib/grid';
import { PrecomputedTile } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const z = parseInt(searchParams.get('z') || '', 10);
    const x = parseInt(searchParams.get('x') || '', 10);
    const y = parseInt(searchParams.get('y') || '', 10);

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return NextResponse.json({ error: 'Invalid tile coordinates' }, { status: 400 });
    }

    // Try to get pre-computed tile from cache
    const cacheKey = `tile:${z}:${x}:${y}`;
    const cachedTile = await cacheGet<PrecomputedTile>(cacheKey);

    if (cachedTile) {
      return NextResponse.json({
        tile: cachedTile,
        cached: true,
      });
    }

    // Tile not found - return bounds so client can compute
    const bounds = tileToBounds(z, x, y);

    return NextResponse.json({
      tile: null,
      bounds,
      cached: false,
      message: 'Tile not pre-computed. Use real-time mode or generate tiles.',
    });
  } catch (error) {
    console.error('Tiles API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
