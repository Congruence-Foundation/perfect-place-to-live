import { Bounds } from '@/types';
import {
  OtodomProperty,
  PropertyFilters,
  PropertyResponse,
  PropertyCluster,
  EstateType,
} from '../types';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng, snapBoundsForCacheKey } from '@/lib/geo';
import { createTimer, logPerf } from '@/lib/profiling';

/**
 * Otodom GraphQL API configuration
 */
const OTODOM_API_URL = 'https://www.otodom.pl/api/query';
const SEARCH_MAP_PINS_HASH = '51e8703aff1dd9b3ad3bae1ab6c543254e19b3576da1ee23eba0dca2b9341e27';
const SEARCH_MAP_QUERY_HASH = 'cef9f63d93a284e3a896b78d67ff42139214c4317f6dfa73231cc1b136a2313d';

/**
 * Cache configuration
 */
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const MAX_CACHE_ENTRIES = 50;

/**
 * Cluster search radius for Otodom API requests (in meters)
 * This is used when fetching properties within a cluster area via the API.
 * Note: This differs from DEFAULT_CLUSTER_RADIUS in enrichment.ts (1000m),
 * which is used for UI-level cluster analysis and price comparison.
 */
const OTODOM_CLUSTER_RADIUS_METERS = 500;

/**
 * Common headers for Otodom API requests
 */
const OTODOM_API_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': 'https://www.otodom.pl',
  'Referer': 'https://www.otodom.pl/',
};

/**
 * Cache for property responses
 * Key: hash of bounds + filters
 * Value: { data, timestamp }
 */
const propertyCache = new Map<string, { data: PropertyResponse; timestamp: number }>();

/**
 * Generate a cache key from bounds and filters
 */
function generatePropertyCacheKey(bounds: Bounds, filters: PropertyFilters): string {
  // Snap bounds to reduce cache misses
  const snappedBounds = snapBoundsForCacheKey(bounds, 2);

  // Sort estate types for consistent cache keys
  const estateKey = (filters.estate ?? ['FLAT']).slice().sort().join(',');
  const isSingleFlat = filters.estate?.length === 1 && filters.estate[0] === 'FLAT';
  const isSingleHouse = filters.estate?.length === 1 && filters.estate[0] === 'HOUSE';

  const filterKey = [
    filters.transaction,
    estateKey,
    filters.priceMin ?? 0,
    filters.priceMax ?? 999999999,
    filters.areaMin ?? 0,
    filters.areaMax ?? 999,
    (filters.roomsNumber ?? []).sort().join(','),
    filters.ownerType ?? 'ALL',
    filters.market ?? 'ALL',
    // Estate-specific filters (only include when single type selected)
    isSingleFlat ? (filters.floors ?? []).sort().join(',') : '',
    isSingleFlat ? (filters.flatBuildingType ?? []).sort().join(',') : '',
    isSingleHouse ? `${filters.terrainAreaMin ?? 0}-${filters.terrainAreaMax ?? 999999}` : '',
    isSingleHouse ? (filters.houseBuildingType ?? []).sort().join(',') : '',
  ].join(':');

  return `otodom:${snappedBounds.south},${snappedBounds.west},${snappedBounds.north},${snappedBounds.east}:${filterKey}`;
}

/**
 * Build GeoJSON polygon from map bounds
 * Note: GeoJSON coordinates are [longitude, latitude] (not [lat, lng])
 */
function buildGeoJsonFromBounds(bounds: Bounds): string {
  const { north, south, east, west } = bounds;
  
  // GeoJSON polygon - coordinates are [lng, lat]
  // Create a simple rectangle polygon
  const geoJson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, north],  // top-left
        [east, north],  // top-right
        [east, south],  // bottom-right
        [west, south],  // bottom-left
        [west, north],  // close the polygon (back to top-left)
      ]],
    },
  };

  return JSON.stringify(geoJson);
}

/**
 * Build the GraphQL request body for SearchMapPins
 * Note: This function takes a single estate type for the API request
 */
function buildSearchMapPinsRequest(bounds: Bounds, filters: PropertyFilters, estateType: EstateType): object {
  const geoJson = buildGeoJsonFromBounds(bounds);

  const filterAttributes: Record<string, unknown> = {
    estate: estateType,  // Single estate type for API
    transaction: filters.transaction,
    market: filters.market ?? 'ALL',
    ownerTypeSingleSelect: filters.ownerType ?? 'ALL',
    // areaMin and areaMax seem to be required based on HAR analysis
    areaMin: filters.areaMin ?? 1,
    areaMax: filters.areaMax ?? 500,
  };

  // Add optional common filters
  if (filters.priceMin !== undefined) filterAttributes.priceMin = filters.priceMin;
  if (filters.priceMax !== undefined) filterAttributes.priceMax = filters.priceMax;
  if (filters.roomsNumber && filters.roomsNumber.length > 0) {
    filterAttributes.roomsNumber = filters.roomsNumber;
  }
  if (filters.pricePerMeterMin !== undefined) filterAttributes.pricePerMeterMin = filters.pricePerMeterMin;
  if (filters.pricePerMeterMax !== undefined) filterAttributes.pricePerMeterMax = filters.pricePerMeterMax;
  if (filters.buildYearMin !== undefined) filterAttributes.buildYearMin = filters.buildYearMin;
  if (filters.buildYearMax !== undefined) filterAttributes.buildYearMax = filters.buildYearMax;
  if (filters.buildingMaterial && filters.buildingMaterial.length > 0) {
    filterAttributes.buildingMaterial = filters.buildingMaterial;
  }
  if (filters.daysSinceCreated) filterAttributes.daysSinceCreated = filters.daysSinceCreated;
  if (filters.description) filterAttributes.description = filters.description;
  if (filters.extras && filters.extras.length > 0) {
    // HAS_PHOTOS is handled separately
    const extras = filters.extras.filter(e => e !== 'HAS_PHOTOS');
    if (extras.length > 0) filterAttributes.extras = extras;
    if (filters.extras.includes('HAS_PHOTOS')) filterAttributes.hasPhotos = true;
  }

  // FLAT-specific filters (only when single FLAT type selected)
  if (estateType === 'FLAT' && filters.estate?.length === 1) {
    if (filters.floors && filters.floors.length > 0) {
      filterAttributes.floors = filters.floors;
    }
    if (filters.floorsNumberMin !== undefined) filterAttributes.floorsNumberMin = filters.floorsNumberMin;
    if (filters.floorsNumberMax !== undefined) filterAttributes.floorsNumberMax = filters.floorsNumberMax;
    if (filters.flatBuildingType && filters.flatBuildingType.length > 0) {
      filterAttributes.buildingType = filters.flatBuildingType;
    }
  }

  // HOUSE-specific filters (only when single HOUSE type selected)
  if (estateType === 'HOUSE' && filters.estate?.length === 1) {
    if (filters.terrainAreaMin !== undefined) filterAttributes.terrainAreaMin = filters.terrainAreaMin;
    if (filters.terrainAreaMax !== undefined) filterAttributes.terrainAreaMax = filters.terrainAreaMax;
    if (filters.houseBuildingType && filters.houseBuildingType.length > 0) {
      filterAttributes.buildingType = filters.houseBuildingType;
    }
    if (filters.isBungalow === true) filterAttributes.isBungalov = true;
  }

  return {
    extensions: {
      persistedQuery: {
        sha256Hash: SEARCH_MAP_PINS_HASH,
        version: 1,
      },
    },
    operationName: 'SearchMapPins',
    variables: {
      clusteringInput: { clusteringAlgorithm: 'FIXED_GRID' },
      fetchAdsDetails: true,
      filterAttributes,
      filterLocations: {
        byGeometry: [{ byGeoJson: geoJson }],
      },
      lang: 'PL',
    },
  };
}

/**
 * Otodom API response types
 */
interface OtodomMapPinItem {
  lat: number;
  lng: number;
  value: number;
  radiusInMeters: number | null;
  shape: string | null;
  ad?: {
    id: number;
    isPromoted: boolean;
    hidePrice: boolean;
    slug: string;
    estate: string;
    title: string;
    createdAtFirst: string;
    openDays: string;
    transaction: string;
    totalPrice: { value: number; currency: string };
    images: { medium: string; large: string }[];
    areaInSquareMeters?: number;
    roomsNumber?: string;
    floor?: number;
    buildYear?: number;
  };
}

interface OtodomSearchMapPinsResponse {
  data: {
    searchMapPins: {
      items: Array<{
        type: 'SINGLE' | 'CLUSTER';
        items: OtodomMapPinItem[];
      }>;
      boundingBox?: {
        neLat: number;
        neLng: number;
        swLat: number;
        swLng: number;
      };
    };
  };
}

/**
 * Transform Otodom API response to our internal format
 */
function transformOtodomResponse(
  response: OtodomSearchMapPinsResponse,
  estateType?: EstateType
): { properties: OtodomProperty[]; clusters: PropertyCluster[] } {
  const properties: OtodomProperty[] = [];
  const clusters: PropertyCluster[] = [];

  // Handle null or missing data from API
  if (!response.data?.searchMapPins?.items) {
    return { properties, clusters };
  }

  for (const group of response.data.searchMapPins.items) {
    if (group.type === 'SINGLE') {
      // Individual properties (when zoomed in)
      for (const item of group.items) {
        if (item.ad) {
          properties.push({
            id: item.ad.id,
            lat: item.lat,
            lng: item.lng,
            title: item.ad.title,
            slug: item.ad.slug,
            estate: item.ad.estate as OtodomProperty['estate'],
            transaction: item.ad.transaction as OtodomProperty['transaction'],
            totalPrice: item.ad.totalPrice,
            areaInSquareMeters: item.ad.areaInSquareMeters ?? 0,
            roomsNumber: item.ad.roomsNumber ?? '',
            floor: item.ad.floor,
            buildYear: item.ad.buildYear,
            images: item.ad.images ?? [],
            isPromoted: item.ad.isPromoted,
            hidePrice: item.ad.hidePrice,
            createdAt: item.ad.createdAtFirst,
            url: `https://www.otodom.pl/pl/oferta/${item.ad.slug}`,
          });
        }
      }
    } else if (group.type === 'CLUSTER') {
      // Clustered properties (when zoomed out)
      for (const item of group.items) {
        if (item.value > 0) {
          clusters.push({
            lat: item.lat,
            lng: item.lng,
            count: item.value,
            radiusInMeters: item.radiusInMeters ?? undefined,
            shape: item.shape ?? undefined,
            estateType: estateType, // Track which estate type this cluster belongs to
          });
        }
      }
    }
  }

  return { properties, clusters };
}

/**
 * Fetch properties for a single estate type from Otodom API
 */
async function fetchSingleEstateType(
  bounds: Bounds,
  filters: PropertyFilters,
  estateType: EstateType,
  signal?: AbortSignal
): Promise<{ properties: OtodomProperty[]; clusters: PropertyCluster[] }> {
  const requestBody = buildSearchMapPinsRequest(bounds, filters, estateType);
  const stopTimer = createTimer('otodom:fetch-single-type');

  const response = await fetch(OTODOM_API_URL, {
    method: 'POST',
    headers: OTODOM_API_HEADERS,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Otodom API error:', response.status, errorText);
    throw new Error(`Otodom API error: ${response.status} ${response.statusText}`);
  }

  const data: OtodomSearchMapPinsResponse = await response.json();
  const result = transformOtodomResponse(data, estateType);
  stopTimer({ estateType, properties: result.properties.length, clusters: result.clusters.length });
  return result;
}

/**
 * Fetch properties from Otodom API
 * Supports multiple estate types by making parallel requests and merging results
 */
export async function fetchOtodomProperties(
  bounds: Bounds,
  filters: PropertyFilters,
  signal?: AbortSignal
): Promise<PropertyResponse> {
  const stopTotalTimer = createTimer('otodom:fetch-total');
  const cacheKey = generatePropertyCacheKey(bounds, filters);
  
  // Check cache
  const cached = propertyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logPerf('otodom:cache-hit', 0, { cacheKey: cacheKey.substring(0, 50) });
    return { ...cached.data, cached: true };
  }

  const estateTypes = filters.estate ?? ['FLAT'];
  
  // Fetch properties for each estate type in parallel
  const stopFetchTimer = createTimer('otodom:fetch-parallel');
  const results = await Promise.all(
    estateTypes.map(type => fetchSingleEstateType(bounds, filters, type, signal))
  );
  stopFetchTimer({ estateTypes: estateTypes.length });

  // Merge results from all estate types
  const stopMergeTimer = createTimer('otodom:merge-results');
  const allProperties: OtodomProperty[] = [];
  const allClusters: PropertyCluster[] = [];
  const seenPropertyIds = new Set<number>();
  
  for (const result of results) {
    // Deduplicate properties by ID
    for (const property of result.properties) {
      if (!seenPropertyIds.has(property.id)) {
        seenPropertyIds.add(property.id);
        allProperties.push(property);
      }
    }
    // Clusters can be added directly (they represent different areas)
    allClusters.push(...result.clusters);
  }
  stopMergeTimer({ properties: allProperties.length, clusters: allClusters.length });

  // Calculate total count from properties + sum of cluster counts
  const clusterTotal = allClusters.reduce((sum, c) => sum + c.count, 0);
  const totalCount = allProperties.length > 0 ? allProperties.length : clusterTotal;

  const result: PropertyResponse = {
    properties: allProperties,
    clusters: allClusters,
    totalCount,
    cached: false,
    fetchedAt: new Date().toISOString(),
  };

  // Update cache
  propertyCache.set(cacheKey, { data: result, timestamp: Date.now() });

  // Clean old cache entries
  if (propertyCache.size > MAX_CACHE_ENTRIES) {
    const entries = Array.from(propertyCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
    toDelete.forEach(([key]) => propertyCache.delete(key));
  }

  stopTotalTimer({ properties: allProperties.length, clusters: allClusters.length, estateTypes: estateTypes.length });
  return result;
}

/**
 * Response type for SearchMapQuery API (actually uses searchAds)
 */
interface OtodomSearchAdsItem {
  id: number;
  slug: string;
  estate: string;
  transaction: string;
  title: string;
  totalPrice: { value: number; currency: string } | null;
  pricePerSquareMeter?: { value: number; currency: string } | null;
  areaInSquareMeters: number;
  roomsNumber?: string;
  floorNumber?: string;
  images: Array<{ medium: string; large: string }>;
  isPromoted: boolean;
  hidePrice: boolean;
  createdAtFirst: string;
  location: {
    mapDetails?: { radius: number };
    address?: {
      street?: { name: string };
      city?: { name: string };
    };
  };
}

interface OtodomSearchAdsResponse {
  data: {
    searchAds: {
      items: OtodomSearchAdsItem[];
      pagination: {
        totalItems: number;
        totalPages: number;
        currentPage: number;
        itemsPerPage: number;
      };
    };
  };
}

/**
 * Build a GeoJSON polygon around a center point
 * Creates a small square area around the cluster center
 */
function buildGeoJsonAroundPoint(lat: number, lng: number, radiusMeters: number = OTODOM_CLUSTER_RADIUS_METERS): string {
  // Calculate degrees offset using the shared functions
  const latOffset = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngOffset = radiusMeters / metersPerDegreeLng(lat);
  
  const geoJson = {
    type: 'Polygon',
    coordinates: [[
      [lng - lngOffset, lat + latOffset],  // top-left
      [lng + lngOffset, lat + latOffset],  // top-right
      [lng + lngOffset, lat - latOffset],  // bottom-right
      [lng - lngOffset, lat - latOffset],  // bottom-left
      [lng - lngOffset, lat + latOffset],  // close polygon
    ]],
  };
  
  return JSON.stringify(geoJson);
}

/**
 * Build the GraphQL request body for SearchMapQuery
 * Used to fetch individual properties within a cluster area
 */
function buildSearchMapQueryRequest(
  geoJson: string,
  filters: PropertyFilters,
  estateType: EstateType,
  page: number = 1,
  limit: number = 36
): object {
  const filterAttributes: Record<string, unknown> = {
    estate: estateType,
    transaction: filters.transaction,
    market: filters.market ?? 'ALL',
    ownerTypeSingleSelect: filters.ownerType ?? 'ALL',
  };

  // Add price filters if set
  if (filters.priceMin !== undefined) filterAttributes.priceMin = filters.priceMin;
  if (filters.priceMax !== undefined) filterAttributes.priceMax = filters.priceMax;
  if (filters.areaMin !== undefined) filterAttributes.areaMin = filters.areaMin;
  if (filters.areaMax !== undefined) filterAttributes.areaMax = filters.areaMax;

  return {
    extensions: {
      persistedQuery: {
        sha256Hash: SEARCH_MAP_QUERY_HASH,
        version: 1,
      },
    },
    operationName: 'SearchMapQuery',
    variables: {
      filterAttributes,
      filterLocations: {
        byGeometry: [{ byGeoJson: geoJson }],
      },
      lang: 'PL',
      page: {
        current: page,
        limit: limit,
      },
      sortingOption: {
        by: 'DEFAULT',
        direction: 'DESC',
      },
    },
  };
}

/**
 * Transform SearchAds response to OtodomProperty array
 * Note: This API doesn't return coordinates, so we use the cluster center
 */
function transformSearchAdsResponse(
  response: OtodomSearchAdsResponse,
  clusterLat: number,
  clusterLng: number
): {
  properties: OtodomProperty[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
} {
  // Defensive check for null/undefined response data
  const searchAds = response?.data?.searchAds;
  if (!searchAds?.items) {
    return {
      properties: [],
      totalCount: 0,
      currentPage: 1,
      totalPages: 0,
    };
  }

  const properties: OtodomProperty[] = searchAds.items.map(item => ({
    id: item.id,
    lat: clusterLat,  // Use cluster center since API doesn't return coordinates
    lng: clusterLng,
    title: item.title,
    slug: item.slug,
    estate: item.estate as EstateType,
    transaction: item.transaction as OtodomProperty['transaction'],
    totalPrice: item.totalPrice ?? { value: 0, currency: 'PLN' },
    pricePerMeter: item.pricePerSquareMeter ?? undefined,
    areaInSquareMeters: item.areaInSquareMeters,
    roomsNumber: item.roomsNumber ?? '',
    floor: item.floorNumber ? parseInt(item.floorNumber) || undefined : undefined,
    buildYear: undefined,
    images: item.images ?? [],
    isPromoted: item.isPromoted,
    hidePrice: item.hidePrice,
    createdAt: item.createdAtFirst,
    url: `https://www.otodom.pl/pl/oferta/${item.slug}`,
  }));

  return {
    properties,
    totalCount: searchAds.pagination?.totalItems ?? 0,
    currentPage: searchAds.pagination?.currentPage ?? 1,
    totalPages: searchAds.pagination?.totalPages ?? 0,
  };
}

/**
 * Fetch properties within a cluster area using SearchMapQuery API
 * This API returns individual properties with pagination support
 * 
 * @param lat - Cluster center latitude
 * @param lng - Cluster center longitude  
 * @param filters - Property filters
 * @param page - Page number (default 1)
 * @param limit - Results per page (default 36)
 * @param shape - GeoJSON polygon string defining the cluster boundary (preferred)
 * @param radiusMeters - Fallback radius if shape not provided
 * @param clusterEstateType - If provided, only fetch this estate type (for accurate cluster counts)
 * @param signal - AbortSignal for cancellation
 */
export async function fetchClusterProperties(
  lat: number,
  lng: number,
  filters: PropertyFilters,
  page: number = 1,
  limit: number = 36,
  shape?: string,
  radiusMeters: number = OTODOM_CLUSTER_RADIUS_METERS,
  clusterEstateType?: string,
  signal?: AbortSignal
): Promise<{
  properties: OtodomProperty[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}> {
  // Use the cluster's actual shape if provided, otherwise fall back to a generated polygon
  const geoJson = shape || buildGeoJsonAroundPoint(lat, lng, radiusMeters);
  
  // If cluster has a specific estate type, only fetch that type for accurate counts
  // Otherwise, fetch all estate types from filters
  const estateTypes = clusterEstateType 
    ? [clusterEstateType as EstateType]
    : (filters.estate ?? ['FLAT']);
  
  // Fetch for each estate type and merge results
  const allProperties: OtodomProperty[] = [];
  let totalCount = 0;
  let totalPages = 1;
  const seenIds = new Set<number>();
  
  for (const estateType of estateTypes) {
    const requestBody = buildSearchMapQueryRequest(geoJson, filters, estateType, page, limit);
    
    const response = await fetch(OTODOM_API_URL, {
      method: 'POST',
      headers: OTODOM_API_HEADERS,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('Otodom SearchMapQuery API error:', response.status, errorText);
      throw new Error(`Otodom API error: ${response.status} ${response.statusText}`);
    }

    const data: OtodomSearchAdsResponse = await response.json();
    
    // Check if response has valid data structure
    if (!data?.data?.searchAds) {
      console.warn('Otodom API returned empty or invalid response for estate type:', estateType);
      continue; // Skip this estate type and try the next one
    }
    
    const result = transformSearchAdsResponse(data, lat, lng);
    
    // Deduplicate and merge
    for (const property of result.properties) {
      if (!seenIds.has(property.id)) {
        seenIds.add(property.id);
        allProperties.push(property);
      }
    }
    
    totalCount += result.totalCount;
    totalPages = Math.max(totalPages, result.totalPages);
  }

  return {
    properties: allProperties,
    totalCount,
    currentPage: page,
    totalPages,
  };
}
