import { neon } from '@neondatabase/serverless';
import { Bounds, POI } from '@/types';

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
 * Convert a full database row to a POI object
 */
function fullRowToPOI(row: POIRowFull): POI {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    name: row.name ?? undefined,
    tags: row.tags ?? {},
  };
}

/**
 * Fetch POIs with full details (name, tags) for popup display
 */
export async function getPOIsWithDetailsFromDB(
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
  for (const row of result as POIRowFull[]) {
    if (!grouped[row.factor_id]) {
      grouped[row.factor_id] = [];
    }
    grouped[row.factor_id].push(fullRowToPOI(row));
  }

  return grouped;
}
