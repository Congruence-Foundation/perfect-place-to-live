import type { Bounds, POI, FactorDef } from '@/types';
import type { TileCoord } from '@/lib/geo/tiles';
import { getCombinedBounds, OVERPASS_API_URL, snapBoundsForCacheKey } from '@/lib/geo';
import { OVERPASS_CONFIG, POI_CACHE_KEY_CONFIG } from '@/constants/performance';
import { createTimer } from '@/lib/profiling';
import {
  distributePOIsByFactorToTiles,
} from './tile-utils';

// Rate limiting: track last request time and use a mutex for proper synchronization
let lastRequestTime = 0;
let rateLimitMutex: Promise<void> = Promise.resolve();

/**
 * Wait for rate limit with proper mutex pattern to prevent race conditions
 * Multiple concurrent calls will queue up properly using promise chaining
 */
async function waitForRateLimit(): Promise<void> {
  // Chain onto the existing mutex to ensure sequential execution
  const previousMutex = rateLimitMutex;
  
  let resolveMutex: () => void;
  rateLimitMutex = new Promise(resolve => {
    resolveMutex = resolve;
  });
  
  // Wait for previous rate limit check to complete
  await previousMutex;
  
  try {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < OVERPASS_CONFIG.MIN_REQUEST_INTERVAL_MS) {
      const waitTime = OVERPASS_CONFIG.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();
  } finally {
    // Release the mutex
    resolveMutex!();
  }
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
 * Parse an OSM tag string into key and value
 * Handles tags that may contain '=' in the value (e.g., "name=Café=Bar")
 */
function parseOsmTag(tag: string): { key: string; value: string } {
  const eqIndex = tag.indexOf('=');
  if (eqIndex === -1) {
    return { key: tag, value: '' };
  }
  return {
    key: tag.slice(0, eqIndex),
    value: tag.slice(eqIndex + 1),
  };
}

/**
 * Build tag queries for a set of OSM tags
 */
function buildTagQueries(osmTags: string[], bbox: string): string {
  return osmTags
    .map(tag => {
      const { key, value } = parseOsmTag(tag);
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
    const { key, value } = parseOsmTag(tagStr);
    return poiTags[key] === value;
  });
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
    { retries, signal, baseDelayMs: OVERPASS_CONFIG.COMBINED_BASE_DELAY_MS }
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
  const factorIds = factorTags.map(f => f.id);
  return distributePOIsByFactorToTiles(allPOIsByFactor, tiles, factorIds);
}

/**
 * Generate a cache key for POI queries
 */
export function generatePOICacheKey(factorId: string, bounds: Bounds): string {
  // Use shared bounds snapping utility
  const snapped = snapBoundsForCacheKey(bounds, POI_CACHE_KEY_CONFIG.BOUNDS_PRECISION);
  return `poi:${factorId}:${snapped.south},${snapped.west},${snapped.north},${snapped.east}`;
}
