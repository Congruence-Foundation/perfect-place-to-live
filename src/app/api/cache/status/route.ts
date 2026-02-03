import { NextResponse } from 'next/server';
import { getCacheStatus, testCacheConnection, getRedisStats } from '@/lib/cache';
import { getHeatmapTileCacheStats } from '@/lib/heatmap-tile-cache';
import { getTileCacheStats } from '@/lib/tile-cache';
import { getPoiTileCacheStats } from '@/lib/poi-tile-cache';
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

/**
 * Format TTL seconds to human-readable string
 */
function formatTTL(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}
