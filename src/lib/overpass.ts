import { Bounds, POI } from '@/types';
import { OVERPASS_API_URL } from '@/config/factors';
import { snapBoundsForCacheKey } from '@/lib/bounds';
import { OVERPASS_CONFIG } from '@/constants/performance';

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
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Omit<RetryOptions, 'signal'> = {
  retries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [429, 503, 504],
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
          console.log(`API ${response.status}, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error(`API error: ${response.status} ${response.statusText} (after ${retries} retries)`);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      // Don't retry if user cancelled
      if (signal?.aborted) throw error;

      if (attempt < retries) {
        const waitTime = Math.min((attempt + 1) * baseDelayMs, maxDelayMs);
        console.log(`Fetch error, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`, error);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }

  // Should never reach here
  throw new Error('Unexpected end of retry loop');
}

/**
 * Build an Overpass QL query for fetching POIs within bounds
 */
function buildOverpassQuery(osmTags: string[], bounds: Bounds): string {
  const { south, west, north, east } = bounds;
  const bbox = `${south},${west},${north},${east}`;

  // Build union of all tag queries
  const tagQueries = osmTags
    .map((tag) => {
      const [key, value] = tag.split('=');
      // Query both nodes and ways (for areas like parks)
      return `
        node["${key}"="${value}"](${bbox});
        way["${key}"="${value}"](${bbox});
      `;
    })
    .join('');

  return `
    [out:json][timeout:${OVERPASS_CONFIG.TIMEOUT_SINGLE}];
    (
      ${tagQueries}
    );
    out center;
  `;
}

/**
 * Build a combined Overpass query for multiple factor types
 * This reduces the number of API calls
 */
function buildCombinedOverpassQuery(
  factorTags: { id: string; osmTags: string[] }[],
  bounds: Bounds
): string {
  const { south, west, north, east } = bounds;
  const bbox = `${south},${west},${north},${east}`;

  // Build union of all tag queries from all factors
  const allTagQueries = factorTags
    .flatMap((factor) =>
      factor.osmTags.map((tag) => {
        const [key, value] = tag.split('=');
        return `
          node["${key}"="${value}"](${bbox});
          way["${key}"="${value}"](${bbox});
        `;
      })
    )
    .join('');

  return `
    [out:json][timeout:${OVERPASS_CONFIG.TIMEOUT_COMBINED}];
    (
      ${allTagQueries}
    );
    out center;
  `;
}

/**
 * Parse Overpass API response into POI array
 */
function parseOverpassResponse(data: OverpassResponse): POI[] {
  return data.elements.map((element) => {
    // For ways, use the center coordinates
    const lat = element.center?.lat ?? element.lat ?? 0;
    const lng = element.center?.lon ?? element.lon ?? 0;

    return {
      id: element.id,
      lat,
      lng,
      tags: element.tags || {},
      name: element.tags?.name,
    };
  });
}

/**
 * Categorize POIs by factor based on their tags
 */
function categorizePOIsByFactor(
  pois: POI[],
  factorTags: { id: string; osmTags: string[] }[]
): Record<string, POI[]> {
  const result: Record<string, POI[]> = {};
  
  // Initialize empty arrays for each factor
  factorTags.forEach((factor) => {
    result[factor.id] = [];
  });

  // Categorize each POI
  for (const poi of pois) {
    for (const factor of factorTags) {
      // Check if POI matches any of the factor's tags
      const matches = factor.osmTags.some((tagStr) => {
        const [key, value] = tagStr.split('=');
        return poi.tags[key] === value;
      });

      if (matches) {
        result[factor.id].push(poi);
        break; // Each POI belongs to one factor only
      }
    }
  }

  return result;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

/**
 * Fetch POIs from Overpass API with retry logic
 */
export async function fetchPOIs(
  osmTags: string[],
  bounds: Bounds,
  signal?: AbortSignal,
  retries: number = 2
): Promise<POI[]> {
  const query = buildOverpassQuery(osmTags, bounds);

  const response = await fetchWithRetry(
    OVERPASS_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    },
    { retries, signal, baseDelayMs: 1000 }
  );

  const data: OverpassResponse = await response.json();
  return parseOverpassResponse(data);
}

/**
 * Fetch all POIs in a single combined query (more efficient)
 * Includes retry logic with exponential backoff
 */
export async function fetchAllPOIsCombined(
  factorTags: { id: string; osmTags: string[] }[],
  bounds: Bounds,
  signal?: AbortSignal,
  retries: number = 3
): Promise<Record<string, POI[]>> {
  const query = buildCombinedOverpassQuery(factorTags, bounds);

  const response = await fetchWithRetry(
    OVERPASS_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    },
    { retries, signal, baseDelayMs: 2000, maxDelayMs: 10000 }
  );

  const data: OverpassResponse = await response.json();
  const allPOIs = parseOverpassResponse(data);
  
  return categorizePOIsByFactor(allPOIs, factorTags);
}

/**
 * Generate a cache key for POI queries
 */
export function generatePOICacheKey(factorId: string, bounds: Bounds): string {
  // Round bounds to reduce cache fragmentation
  const roundedBounds = snapBoundsForCacheKey(bounds, 2);

  return `poi:${factorId}:${roundedBounds.south},${roundedBounds.west},${roundedBounds.north},${roundedBounds.east}`;
}
