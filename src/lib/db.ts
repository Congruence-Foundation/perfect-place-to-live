import { neon } from '@neondatabase/serverless';
import { Bounds, POI } from '@/types';

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
 * Group POI rows by factor ID
 */
export function groupPOIsByFactor(rows: POIRow[]): Record<string, POI[]> {
  const grouped: Record<string, POI[]> = {};
  for (const row of rows) {
    if (!grouped[row.factor_id]) {
      grouped[row.factor_id] = [];
    }
    grouped[row.factor_id].push(rowToPOI(row));
  }
  return grouped;
}

/**
 * Fetch POIs from the Neon PostgreSQL database within the given bounds
 * 
 * @param factorIds - Array of factor IDs to fetch (e.g., ['pharmacy', 'school'])
 * @param bounds - Geographic bounding box
 * @returns POIs grouped by factor ID
 * 
 * @example
 * const pois = await getPOIsFromDB(['pharmacy', 'school'], {
 *   north: 52.3,
 *   south: 52.1,
 *   east: 21.1,
 *   west: 20.9
 * });
 */
export async function getPOIsFromDB(
  factorIds: string[],
  bounds: Bounds
): Promise<Record<string, POI[]>> {
  if (factorIds.length === 0) {
    return {};
  }

  const result = await sql`
    SELECT factor_id, id, lat, lng, name, tags
    FROM osm_pois
    WHERE factor_id = ANY(${factorIds})
      AND geom && ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)
  `;

  // Initialize empty arrays for all requested factors
  const grouped: Record<string, POI[]> = {};
  for (const factorId of factorIds) {
    grouped[factorId] = [];
  }

  // Group results by factor_id
  for (const row of result as POIRow[]) {
    if (!grouped[row.factor_id]) {
      grouped[row.factor_id] = [];
    }
    grouped[row.factor_id].push(rowToPOI(row));
  }

  return grouped;
}

/**
 * Check if the database connection is working
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the count of POIs in the database by factor
 */
export async function getPOICounts(): Promise<Record<string, number>> {
  const result = await sql`
    SELECT factor_id, COUNT(*) as count
    FROM osm_pois
    GROUP BY factor_id
  `;

  const counts: Record<string, number> = {};
  for (const row of result as { factor_id: string; count: string }[]) {
    counts[row.factor_id] = parseInt(row.count, 10);
  }
  return counts;
}
