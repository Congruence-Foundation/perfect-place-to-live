import type { Bounds, POI } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { tileToBounds } from '@/lib/geo/grid';
import { OVERPASS_API_URL } from '@/config/factors';
import { OVERPASS_CONFIG } from '@/constants/performance';
import { createTimer } from '@/lib/profiling';

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 200; // ms between requests

/**
 * Wait for rate limit
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Options for fetchWithRetry
 */
interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  signal?: AbortSignal;
  retryableStatuses?: readonly number[];
}

const DEFAULT_RETRY_OPTIONS: Omit<RetryOptions, 'signal'> = {
  retries: OVERPASS_CONFIG.RETRY_COUNT,
  baseDelayMs: OVERPASS_CONFIG.BASE_DELAY_MS,
  maxDelayMs: OVERPASS_CONFIG.MAX_DELAY_MS,
  retryableStatuses: OVERPASS_CONFIG.RETRYABLE_STATUSES,
};

/**
 * Generic fetch with retry and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  fetchOptions: RequestInit,
  retryOptions: Partial<RetryOptions> = {}
): Promise<Response> {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  const { retries, baseDelayMs, maxDelayMs, signal, retryableStatuses } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitForRateLimit();

    try {
      const response = await fetch(url, { ...fetchOptions, signal });

      if (retryableStatuses?.includes(response.status)) {
        if (attempt < retries) {
          const waitTime = Math.min((attempt + 1) * baseDelayMs, maxDelayMs);
          console.log(`Overpass API ${response.status}, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error(`Overpass API error: ${response.status} ${response.statusText} (after ${retries} retries)`);
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      // Don't retry if user cancelled
      if (signal?.aborted) throw error;

      if (attempt < retries) {
        const waitTime = Math.min((attempt + 1) * baseDelayMs, maxDelayMs);
        console.log(`Overpass fetch error, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`, error);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unexpected end of retry loop');
}

// ============================================================================
// Overpass Response Types
// ============================================================================

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

// ============================================================================
// Query Builders
// ============================================================================

/**
 * Build an Overpass QL query for fetching POIs within bounds
 */
function buildOverpassQuery(osmTags: string[], bounds: Bounds): string {
  const bbox = formatBbox(bounds);
  const tagQueries = buildTagQueries(osmTags, bbox);

  return `
    [out:json][timeout:${OVERPASS_CONFIG.TIMEOUT_SINGLE}];
    (${tagQueries})
    out center;
  `;
}

/**
 * Build a combined Overpass query for multiple factor types
 */
function buildCombinedOverpassQuery(
  factorTags: FactorDef[],
  bounds: Bounds
): string {
  const bbox = formatBbox(bounds);
  const allTagQueries = factorTags
    .flatMap(factor => buildTagQueries(factor.osmTags, bbox))
    .join('');

  return `
    [out:json][timeout:${OVERPASS_CONFIG.TIMEOUT_COMBINED}];
    (${allTagQueries})
    out center;
  `;
}

/**
 * Format bounds as Overpass bbox string
 */
function formatBbox(bounds: Bounds): string {
  return `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
}

/**
 * Build tag queries for a set of OSM tags
 */
function buildTagQueries(osmTags: string[], bbox: string): string {
  return osmTags
    .map(tag => {
      const [key, value] = tag.split('=');
      return `
        node["${key}"="${value}"](${bbox});
        way["${key}"="${value}"](${bbox});
      `;
    })
    .join('');
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse Overpass API response into POI array
 */
function parseOverpassResponse(data: OverpassResponse): POI[] {
  return data.elements.map(element => ({
    id: element.id,
    lat: element.center?.lat ?? element.lat ?? 0,
    lng: element.center?.lon ?? element.lon ?? 0,
    tags: element.tags || {},
    name: element.tags?.name,
  }));
}

/**
 * Categorize POIs by factor based on their tags
 */
function categorizePOIsByFactor(
  pois: POI[],
  factorTags: FactorDef[]
): Record<string, POI[]> {
  const result: Record<string, POI[]> = {};
  
  // Initialize empty arrays for each factor
  for (const factor of factorTags) {
    result[factor.id] = [];
  }

  // Categorize each POI
  for (const poi of pois) {
    for (const factor of factorTags) {
      if (matchesAnyTag(poi.tags, factor.osmTags)) {
        result[factor.id].push(poi);
        break; // Each POI belongs to one factor only
      }
    }
  }

  return result;
}

/**
 * Check if POI tags match any of the OSM tags
 */
function matchesAnyTag(poiTags: Record<string, string>, osmTags: string[]): boolean {
  return osmTags.some(tagStr => {
    const [key, value] = tagStr.split('=');
    return poiTags[key] === value;
  });
}

// ============================================================================
// Factor Definition Type
// ============================================================================

interface FactorDef {
  id: string;
  osmTags: string[];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch POIs from Overpass API for a single factor
 */
export async function fetchPOIsFromOverpass(
  osmTags: string[],
  bounds: Bounds,
  signal?: AbortSignal,
  retries: number = OVERPASS_CONFIG.RETRY_COUNT
): Promise<POI[]> {
  const query = buildOverpassQuery(osmTags, bounds);

  const response = await fetchWithRetry(
    OVERPASS_API_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    },
    { retries, signal }
  );

  const data: OverpassResponse = await response.json();
  return parseOverpassResponse(data);
}

/**
 * Fetch all POIs for multiple factors in a single combined query
 */
export async function fetchAllPOIsCombined(
  factorTags: FactorDef[],
  bounds: Bounds,
  signal?: AbortSignal,
  retries: number = OVERPASS_CONFIG.RETRY_COUNT
): Promise<Record<string, POI[]>> {
  const query = buildCombinedOverpassQuery(factorTags, bounds);

  const stopTimer = createTimer('overpass:combined-query');
  const response = await fetchWithRetry(
    OVERPASS_API_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    },
    { retries, signal, baseDelayMs: 2000 }
  );

  const data: OverpassResponse = await response.json();
  const allPOIs = parseOverpassResponse(data);
  stopTimer({ factors: factorTags.length, pois: allPOIs.length });
  
  return categorizePOIsByFactor(allPOIs, factorTags);
}

/**
 * Fetch POIs for multiple tiles in a single Overpass query
 * 
 * This is more efficient than fetching each tile separately because:
 * 1. Single API call instead of N calls (avoids rate limiting)
 * 2. Overpass can optimize the query internally
 * 
 * @param tiles - Array of tile coordinates to fetch
 * @param factorTags - Array of factor definitions
 * @param signal - Optional AbortSignal for cancellation
 * @returns Map of tile key to POIs grouped by factor ID
 */
export async function fetchPOIsForTilesBatched(
  tiles: TileCoord[],
  factorTags: FactorDef[],
  signal?: AbortSignal
): Promise<Map<string, Record<string, POI[]>>> {
  if (tiles.length === 0 || factorTags.length === 0) {
    return new Map();
  }

  // Calculate combined bounds for all tiles
  const combinedBounds = getCombinedBounds(tiles);
  
  // Fetch all POIs in the combined region
  const stopTimer = createTimer('overpass:batch-query');
  const allPOIsByFactor = await fetchAllPOIsCombined(factorTags, combinedBounds, signal);
  stopTimer({ tiles: tiles.length, factors: factorTags.length });

  // Distribute POIs to their respective tiles
  return distributePOIsToTiles(allPOIsByFactor, tiles, factorTags);
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
 */
function distributePOIsToTiles(
  poisByFactor: Record<string, POI[]>,
  tiles: TileCoord[],
  factorTags: FactorDef[]
): Map<string, Record<string, POI[]>> {
  // Pre-compute tile bounds for efficient lookup
  const tileBoundsMap = new Map<string, Bounds>();
  for (const tile of tiles) {
    const key = `${tile.z}:${tile.x}:${tile.y}`;
    tileBoundsMap.set(key, tileToBounds(tile.z, tile.x, tile.y));
  }

  // Initialize result map with empty arrays
  const result = new Map<string, Record<string, POI[]>>();
  for (const tile of tiles) {
    const key = `${tile.z}:${tile.x}:${tile.y}`;
    const factorMap: Record<string, POI[]> = {};
    for (const factor of factorTags) {
      factorMap[factor.id] = [];
    }
    result.set(key, factorMap);
  }

  // Assign each POI to its tile
  for (const [factorId, pois] of Object.entries(poisByFactor)) {
    for (const poi of pois) {
      for (const [tileKey, bounds] of tileBoundsMap) {
        if (isPointInBounds(poi.lat, poi.lng, bounds)) {
          const tileData = result.get(tileKey);
          if (tileData?.[factorId]) {
            tileData[factorId].push(poi);
          }
          break; // POI belongs to exactly one tile
        }
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

/**
 * Generate a cache key for POI queries (legacy)
 */
export function generatePOICacheKey(factorId: string, bounds: Bounds): string {
  // Round bounds to reduce cache fragmentation
  const precision = 2;
  const roundedBounds = {
    south: Math.floor(bounds.south * Math.pow(10, precision)) / Math.pow(10, precision),
    west: Math.floor(bounds.west * Math.pow(10, precision)) / Math.pow(10, precision),
    north: Math.ceil(bounds.north * Math.pow(10, precision)) / Math.pow(10, precision),
    east: Math.ceil(bounds.east * Math.pow(10, precision)) / Math.pow(10, precision),
  };

  return `poi:${factorId}:${roundedBounds.south},${roundedBounds.west},${roundedBounds.north},${roundedBounds.east}`;
}
