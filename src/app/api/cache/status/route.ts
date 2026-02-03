import { NextResponse } from 'next/server';
import { getCacheStatus, testCacheConnection, getRedisStats } from '@/lib/cache';
import { getHeatmapTileCacheStats } from '@/lib/heatmap-tile-cache';
import { getTileCacheStats } from '@/lib/tile-cache';
import { getPoiTileCacheStats } from '@/lib/poi-tile-cache';
import { formatTTL } from '@/lib/api-utils';
import { 
  PROPERTY_TILE_CONFIG, 
  HEATMAP_TILE_CONFIG, 
  POI_TILE_CONFIG 
} from '@/constants/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cache/status
 * 
 * Returns cache status information for debugging and monitoring.
 * Useful for verifying Redis connection locally or in production.
 */
export async function GET() {
  const status = getCacheStatus();
  const connectionTest = await testCacheConnection();
  const redisStats = await getRedisStats();
  
  // Get LRU cache statistics
  const heatmapStats = getHeatmapTileCacheStats();
  const propertyStats = getTileCacheStats();
  const poiStats = getPoiTileCacheStats();

  return NextResponse.json({
    cache: {
      ...status,
      connection: connectionTest,
      redisStats,
    },
    lruCaches: {
      heatmap: {
        ...heatmapStats,
        ttlSeconds: HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS,
        ttlHuman: formatTTL(HEATMAP_TILE_CONFIG.SERVER_TTL_SECONDS),
      },
      property: {
        ...propertyStats,
        ttlSeconds: PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS,
        ttlHuman: formatTTL(PROPERTY_TILE_CONFIG.SERVER_TTL_SECONDS),
      },
      poi: {
        ...poiStats,
        ttlSeconds: POI_TILE_CONFIG.SERVER_TTL_SECONDS,
        ttlHuman: formatTTL(POI_TILE_CONFIG.SERVER_TTL_SECONDS),
      },
    },
    timestamp: new Date().toISOString(),
  });
}
