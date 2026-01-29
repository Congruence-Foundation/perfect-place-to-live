import { Bounds, POI } from '@/types';
import { OVERPASS_API_URL } from '@/config/factors';

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
 * Build an Overpass QL query for fetching POIs within bounds
 */
export function buildOverpassQuery(osmTags: string[], bounds: Bounds): string {
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
    [out:json][timeout:30];
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
export function buildCombinedOverpassQuery(
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
    [out:json][timeout:60];
    (
      ${allTagQueries}
    );
    out center;
  `;
}

/**
 * Parse Overpass API response into POI array
 */
export function parseOverpassResponse(data: OverpassResponse): POI[] {
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
export function categorizePOIsByFactor(
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
  await waitForRateLimit();
  
  const query = buildOverpassQuery(osmTags, bounds);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });

      if (response.status === 429) {
        // Rate limited - wait and retry
        if (attempt < retries) {
          const waitTime = (attempt + 1) * 1000; // Exponential backoff
          console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error('Overpass API rate limit exceeded');
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();
      return parseOverpassResponse(data);
    } catch (error) {
      if (attempt === retries) throw error;
      // Wait before retry on other errors
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return [];
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

  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitForRateLimit();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(OVERPASS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: signal || controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (response.status === 429 || response.status === 504 || response.status === 503) {
        // Rate limited or timeout - wait and retry
        if (attempt < retries) {
          const waitTime = Math.min((attempt + 1) * 2000, 10000); // 2s, 4s, 6s... max 10s
          console.log(`Overpass API ${response.status}, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        throw new Error(`Overpass API error: ${response.status} ${response.statusText} (after ${retries} retries)`);
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();
      const allPOIs = parseOverpassResponse(data);
      
      return categorizePOIsByFactor(allPOIs, factorTags);
    } catch (error) {
      if (signal?.aborted) throw error; // Don't retry if user cancelled
      
      if (attempt < retries) {
        const waitTime = Math.min((attempt + 1) * 2000, 10000);
        console.log(`Overpass fetch error, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}...`, error);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }

  // Should never reach here, but return empty result as fallback
  return factorTags.reduce((acc, f) => ({ ...acc, [f.id]: [] }), {});
}

/**
 * Fetch POIs for multiple factors sequentially (to avoid rate limiting)
 */
export async function fetchPOIsForFactors(
  factors: { id: string; osmTags: string[] }[],
  bounds: Bounds,
  signal?: AbortSignal
): Promise<Record<string, POI[]>> {
  const results: Record<string, POI[]> = {};

  // Fetch sequentially to avoid rate limiting
  for (const factor of factors) {
    try {
      const pois = await fetchPOIs(factor.osmTags, bounds, signal);
      results[factor.id] = pois;
    } catch (error) {
      console.error(`Error fetching POIs for ${factor.id}:`, error);
      results[factor.id] = [];
    }
  }

  return results;
}

/**
 * Generate a cache key for POI queries
 */
export function generatePOICacheKey(factorId: string, bounds: Bounds): string {
  // Round bounds to reduce cache fragmentation
  const precision = 2;
  const roundedBounds = {
    north: Math.ceil(bounds.north * 10 ** precision) / 10 ** precision,
    south: Math.floor(bounds.south * 10 ** precision) / 10 ** precision,
    east: Math.ceil(bounds.east * 10 ** precision) / 10 ** precision,
    west: Math.floor(bounds.west * 10 ** precision) / 10 ** precision,
  };

  return `poi:${factorId}:${roundedBounds.south},${roundedBounds.west},${roundedBounds.north},${roundedBounds.east}`;
}
