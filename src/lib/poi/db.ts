import { neon } from '@neondatabase/serverless';
import type { Bounds, POI } from '@/types';
import { createTimer } from '@/lib/profiling';
import type { TileCoord } from '@/lib/geo/tiles';
import { tileToBounds } from '@/lib/geo/grid';

/**
 * Create a Neon SQL client
 * Uses connection pooling for serverless environments
 */
const sql = neon(process.env.DATABASE_URL!);

/**
 * Full POI row type including name and tags (for popups)
 */
interface POIRowFull {
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
function rowToPOI(row: POIRowFull): POI {
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
function groupByFactor(rows: POIRowFull[], factorIds: string[]): Record<string, POI[]> {
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

  return groupByFactor(result as POIRowFull[], factorIds);
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
  return distributePOIsToTiles(result as POIRowFull[], tiles, factorIds);
}

/**
 * Calculate combined bounds that covers all tiles
 */
function getCombinedBounds(tiles: TileCoord[]): Bounds {
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;

  for (const tile of tiles) {
    const bounds = tileToBounds(tile.z, tile.x, tile.y);
    if (bounds.north > north) north = bounds.north;
    if (bounds.south < south) south = bounds.south;
    if (bounds.east > east) east = bounds.east;
    if (bounds.west < west) west = bounds.west;
  }

  return { north, south, east, west };
}

/**
 * Distribute POIs from a combined query to their respective tiles
 * Each POI is assigned to the tile that contains its coordinates
 */
function distributePOIsToTiles(
  rows: POIRowFull[],
  tiles: TileCoord[],
  factorIds: string[]
): Map<string, Record<string, POI[]>> {
  // Pre-compute tile bounds for efficient lookup
  const tileBoundsMap = new Map<string, Bounds>();
  for (const tile of tiles) {
    const key = `${tile.z}:${tile.x}:${tile.y}`;
    tileBoundsMap.set(key, tileToBounds(tile.z, tile.x, tile.y));
  }

  // Initialize result map with empty arrays for each tile and factor
  const result = new Map<string, Record<string, POI[]>>();
  for (const tile of tiles) {
    const key = `${tile.z}:${tile.x}:${tile.y}`;
    const factorMap: Record<string, POI[]> = {};
    for (const factorId of factorIds) {
      factorMap[factorId] = [];
    }
    result.set(key, factorMap);
  }

  // Assign each POI to its tile
  for (const row of rows) {
    const poi = rowToPOI(row);
    
    // Find which tile contains this POI
    for (const [tileKey, bounds] of tileBoundsMap) {
      if (isPointInBounds(poi.lat, poi.lng, bounds)) {
        const tileData = result.get(tileKey);
        if (tileData && tileData[row.factor_id]) {
          tileData[row.factor_id].push(poi);
        }
        break; // POI belongs to exactly one tile
      }
    }
  }

  return result;
}

/**
 * Check if a point is within bounds (inclusive)
 */
function isPointInBounds(lat: number, lng: number, bounds: Bounds): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
