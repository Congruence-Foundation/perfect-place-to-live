import { neon } from '@neondatabase/serverless';
import type { Bounds, POI } from '@/types';
import { createTimer } from '@/lib/profiling';
import type { TileCoord } from '@/lib/geo/tiles';
import { getCombinedBounds } from '@/lib/geo/bounds';
import {
  initializeTileResultMap,
  assignPOIToTile,
  findTileForPointFast,
} from './tile-utils';
import { getTileKeyString } from '@/lib/geo/tiles';

/**
 * Create a Neon SQL client
 * Uses connection pooling for serverless environments
 */
const sql = neon(process.env.DATABASE_URL!);

/**
 * Database row type for POI queries
 */
interface POIRow {
  id: number;
  factor_id: string;
  lat: number;
  lng: number;
  name: string | null;
  tags: Record<string, string> | null;
}

/**
 * Convert a database row to a POI object
 */
function rowToPOI(row: POIRow): POI {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    name: row.name ?? undefined,
    tags: row.tags ?? {},
  };
}

/**
 * Group POI rows by factor_id
 */
function groupByFactor(rows: POIRow[], factorIds: string[]): Record<string, POI[]> {
  const grouped: Record<string, POI[]> = {};
  
  // Initialize empty arrays for all requested factors
  for (const factorId of factorIds) {
    grouped[factorId] = [];
  }

  // Group results by factor_id
  for (const row of rows) {
    if (grouped[row.factor_id]) {
      grouped[row.factor_id].push(rowToPOI(row));
    }
  }

  return grouped;
}

/**
 * Fetch POIs for a single bounding box
 * 
 * @param factorIds - Array of factor IDs to fetch
 * @param bounds - Geographic bounding box
 * @returns POIs grouped by factor ID
 */
export async function getPOIsFromDB(
  factorIds: string[],
  bounds: Bounds
): Promise<Record<string, POI[]>> {
  if (factorIds.length === 0) {
    return {};
  }

  const stopQueryTimer = createTimer('poi-db:query');
  const result = await sql`
    SELECT factor_id, id, lat, lng, name, tags
    FROM osm_pois
    WHERE factor_id = ANY(${factorIds})
      AND geom && ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)
  `;
  stopQueryTimer({ factors: factorIds.length, rows: result.length });

  return groupByFactor(result as POIRow[], factorIds);
}

/**
 * Fetch POIs for multiple tiles in a single database query
 * 
 * This is much more efficient than fetching each tile separately because:
 * 1. Single database round-trip instead of N round-trips
 * 2. PostGIS can optimize the spatial query across the combined region
 * 3. Reduces connection overhead
 * 
 * @param tiles - Array of tile coordinates to fetch
 * @param factorIds - Array of factor IDs to fetch
 * @returns Map of tile key to POIs grouped by factor ID
 */
export async function getPOIsForTilesBatched(
  tiles: TileCoord[],
  factorIds: string[]
): Promise<Map<string, Record<string, POI[]>>> {
  if (tiles.length === 0 || factorIds.length === 0) {
    return new Map();
  }

  // Calculate combined bounds for all tiles
  const combinedBounds = getCombinedBounds(tiles);
  
  const stopQueryTimer = createTimer('poi-db:batch-query');
  const result = await sql`
    SELECT factor_id, id, lat, lng, name, tags
    FROM osm_pois
    WHERE factor_id = ANY(${factorIds})
      AND geom && ST_MakeEnvelope(
        ${combinedBounds.west}, 
        ${combinedBounds.south}, 
        ${combinedBounds.east}, 
        ${combinedBounds.north}, 
        4326
      )
  `;
  stopQueryTimer({ 
    tiles: tiles.length, 
    factors: factorIds.length, 
    rows: result.length,
    bounds: `${combinedBounds.west.toFixed(3)},${combinedBounds.south.toFixed(3)},${combinedBounds.east.toFixed(3)},${combinedBounds.north.toFixed(3)}`
  });

  // Distribute POIs to their respective tiles
  return distributePOIsToTiles(result as POIRow[], tiles, factorIds);
}

/**
 * Distribute POIs from a combined query to their respective tiles
 * Each POI is assigned to the tile that contains its coordinates
 * Uses O(1) tile lookup for better performance
 */
function distributePOIsToTiles(
  rows: POIRow[],
  tiles: TileCoord[],
  factorIds: string[]
): Map<string, Record<string, POI[]>> {
  if (tiles.length === 0) {
    return new Map();
  }

  // Get zoom level from first tile (all tiles should have same zoom)
  const zoom = tiles[0].z;
  
  // Validate all tiles have the same zoom level
  const invalidTile = tiles.find(t => t.z !== zoom);
  if (invalidTile) {
    throw new Error(`All tiles must have the same zoom level. Expected ${zoom}, found ${invalidTile.z}`);
  }
  
  // Build set of valid tile keys for O(1) lookup
  const validTileKeys = new Set<string>();
  for (const tile of tiles) {
    validTileKeys.add(getTileKeyString(tile));
  }

  const result = initializeTileResultMap(tiles, factorIds);

  for (const row of rows) {
    const poi = rowToPOI(row);
    const tileKey = findTileForPointFast(poi.lat, poi.lng, zoom, validTileKeys);
    
    if (tileKey) {
      assignPOIToTile(poi, row.factor_id, tileKey, result);
    }
  }

  return result;
}
