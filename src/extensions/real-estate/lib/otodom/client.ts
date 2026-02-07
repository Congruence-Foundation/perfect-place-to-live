/**
 * Otodom.pl API Client
 *
 * GraphQL client for the Otodom.pl real estate API at https://www.otodom.pl/api/query
 * Uses persisted queries with SHA256 hashes for SearchMapPins and SearchMapQuery operations.
 */

import type { Bounds } from '@/types';
import type {
  OtodomProperty,
  OtodomPropertyFilters,
  OtodomPropertyResponse,
  OtodomPropertyCluster,
  OtodomEstateType,
} from './types';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng, snapBoundsForCacheKey } from '@/lib/geo';
import { createTimer, logPerf } from '@/lib/profiling';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CACHE_CONFIG } from '@/constants/performance';
import {
  OTODOM_API_URL,
  OTODOM_SEARCH_MAP_PINS_HASH,
  OTODOM_SEARCH_MAP_QUERY_HASH,
  OTODOM_CLUSTER_RADIUS_METERS,
  OTODOM_DEFAULT_AREA_MIN,
  OTODOM_DEFAULT_AREA_MAX,
  OTODOM_DEFAULT_CLUSTER_PAGE_LIMIT,
  FILTER_DEFAULT_PRICE_MAX,
  FILTER_DEFAULT_AREA_MAX,
  FILTER_DEFAULT_TERRAIN_AREA_MAX,
} from '../../config/constants';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Valid estate types for runtime validation.
 * Currently only FLAT and HOUSE are supported by the map search API.
 */
const SUPPORTED_ESTATE_TYPES = new Set<OtodomEstateType>(['FLAT', 'HOUSE']);

/**
 * Common headers for Otodom API requests
 */
const OTODOM_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  Origin: 'https://www.otodom.pl',
  Referer: 'https://www.otodom.pl/',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate and normalize estate type from API response.
 * Returns 'FLAT' as default if the value is invalid or unsupported.
 */
function validateEstateType(value: unknown): OtodomEstateType {
  if (typeof value === 'string' && SUPPORTED_ESTATE_TYPES.has(value as OtodomEstateType)) {
    return value as OtodomEstateType;
  }
  return 'FLAT'; // Default fallback
}

/**
 * Execute a POST request to Otodom API with error handling
 */
async function otodomPost<T>(
  requestBody: object,
  signal?: AbortSignal,
  operationName: string = 'Otodom API'
): Promise<T> {
  const response = await fetch(OTODOM_API_URL, {
    method: 'POST',
    headers: OTODOM_HEADERS,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`${operationName} error:`, response.status, errorText);
    throw new Error(`Otodom API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Generate a cache key from bounds and filters
 */
function generatePropertyCacheKey(bounds: Bounds, filters: OtodomPropertyFilters): string {
  const snappedBounds = snapBoundsForCacheKey(bounds, 2);
  const estateKey = (filters.estate ?? ['FLAT']).slice().sort().join(',');
  const isSingleFlat = filters.estate?.length === 1 && filters.estate[0] === 'FLAT';
  const isSingleHouse = filters.estate?.length === 1 && filters.estate[0] === 'HOUSE';

  const filterKey = [
    filters.transaction,
    estateKey,
    filters.priceMin ?? 0,
    filters.priceMax ?? FILTER_DEFAULT_PRICE_MAX,
    filters.areaMin ?? 0,
    filters.areaMax ?? FILTER_DEFAULT_AREA_MAX,
    (filters.roomsNumber ?? []).sort().join(','),
    filters.ownerType ?? 'ALL',
    filters.market ?? 'ALL',
    isSingleFlat ? (filters.floors ?? []).sort().join(',') : '',
    isSingleFlat ? (filters.flatBuildingType ?? []).sort().join(',') : '',
    isSingleHouse ? `${filters.terrainAreaMin ?? 0}-${filters.terrainAreaMax ?? FILTER_DEFAULT_TERRAIN_AREA_MAX}` : '',
    isSingleHouse ? (filters.houseBuildingType ?? []).sort().join(',') : '',
    // Advanced filters
    (filters.extras ?? []).sort().join(','),
    (filters.buildingMaterial ?? []).sort().join(','),
    filters.pricePerMeterMin ?? '',
    filters.pricePerMeterMax ?? '',
    filters.buildYearMin ?? '',
    filters.buildYearMax ?? '',
    filters.daysSinceCreated ?? '',
    filters.description ?? '',
    isSingleFlat ? (filters.floorsNumberMin ?? '') : '',
    isSingleFlat ? (filters.floorsNumberMax ?? '') : '',
    isSingleHouse ? (filters.isBungalow ?? '') : '',
  ].join(':');

  return `otodom:${snappedBounds.south},${snappedBounds.west},${snappedBounds.north},${snappedBounds.east}:${filterKey}`;
}

/**
 * Build GeoJSON polygon from map bounds
 */
function buildGeoJsonFromBounds(bounds: Bounds): string {
  const { north, south, east, west } = bounds;
  const geoJson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north],
      ]],
    },
  };
  return JSON.stringify(geoJson);
}

/**
 * Add common optional filters to filter attributes
 */
function addCommonFilters(filterAttributes: Record<string, unknown>, filters: OtodomPropertyFilters): void {
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
    const extras = filters.extras.filter(e => e !== 'HAS_PHOTOS');
    if (extras.length > 0) filterAttributes.extras = extras;
    if (filters.extras.includes('HAS_PHOTOS')) filterAttributes.hasPhotos = true;
  }
}

/**
 * Add FLAT-specific filters
 */
function addFlatFilters(filterAttributes: Record<string, unknown>, filters: OtodomPropertyFilters): void {
  if (filters.floors && filters.floors.length > 0) {
    filterAttributes.floors = filters.floors;
  }
  if (filters.floorsNumberMin !== undefined) filterAttributes.floorsNumberMin = filters.floorsNumberMin;
  if (filters.floorsNumberMax !== undefined) filterAttributes.floorsNumberMax = filters.floorsNumberMax;
  if (filters.flatBuildingType && filters.flatBuildingType.length > 0) {
    filterAttributes.buildingType = filters.flatBuildingType;
  }
}

/**
 * Add HOUSE-specific filters
 */
function addHouseFilters(filterAttributes: Record<string, unknown>, filters: OtodomPropertyFilters): void {
  if (filters.terrainAreaMin !== undefined) filterAttributes.terrainAreaMin = filters.terrainAreaMin;
  if (filters.terrainAreaMax !== undefined) filterAttributes.terrainAreaMax = filters.terrainAreaMax;
  if (filters.houseBuildingType && filters.houseBuildingType.length > 0) {
    filterAttributes.buildingType = filters.houseBuildingType;
  }
  if (filters.isBungalow === true) filterAttributes.isBungalov = true;
}

/**
 * Build the GraphQL request body for SearchMapPins
 */
function buildSearchMapPinsRequest(bounds: Bounds, filters: OtodomPropertyFilters, estateType: OtodomEstateType): object {
  const geoJson = buildGeoJsonFromBounds(bounds);

  const filterAttributes: Record<string, unknown> = {
    estate: estateType,
    transaction: filters.transaction,
    market: filters.market ?? 'ALL',
    ownerTypeSingleSelect: filters.ownerType ?? 'ALL',
    areaMin: filters.areaMin ?? OTODOM_DEFAULT_AREA_MIN,
    areaMax: filters.areaMax ?? OTODOM_DEFAULT_AREA_MAX,
  };

  addCommonFilters(filterAttributes, filters);

  // Apply type-specific filters only when filtering for a single estate type
  const isSingleType = filters.estate?.length === 1;
  if (isSingleType && estateType === 'FLAT') {
    addFlatFilters(filterAttributes, filters);
  }
  if (isSingleType && estateType === 'HOUSE') {
    addHouseFilters(filterAttributes, filters);
  }

  return {
    extensions: {
      persistedQuery: {
        sha256Hash: OTODOM_SEARCH_MAP_PINS_HASH,
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

// ============================================================================
// API Response Types
// ============================================================================

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

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transform Otodom API response to our internal format
 */
function transformOtodomResponse(
  response: OtodomSearchMapPinsResponse,
  estateType?: OtodomEstateType
): { properties: OtodomProperty[]; clusters: OtodomPropertyCluster[] } {
  const properties: OtodomProperty[] = [];
  const clusters: OtodomPropertyCluster[] = [];

  if (!response.data?.searchMapPins?.items) {
    return { properties, clusters };
  }

  for (const group of response.data.searchMapPins.items) {
    if (group.type === 'SINGLE') {
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
      for (const item of group.items) {
        if (item.value > 0) {
          clusters.push({
            lat: item.lat,
            lng: item.lng,
            count: item.value,
            radiusInMeters: item.radiusInMeters ?? undefined,
            shape: item.shape ?? undefined,
            estateType: estateType,
          });
        }
      }
    }
  }

  return { properties, clusters };
}

/**
 * Transform SearchAds response to OtodomProperty array
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
    lat: clusterLat,
    lng: clusterLng,
    title: item.title,
    slug: item.slug,
    estate: validateEstateType(item.estate),
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

// ============================================================================
// Fetch Functions
// ============================================================================

/**
 * Fetch properties for a single estate type from Otodom API
 */
async function fetchSingleEstateType(
  bounds: Bounds,
  filters: OtodomPropertyFilters,
  estateType: OtodomEstateType,
  signal?: AbortSignal
): Promise<{ properties: OtodomProperty[]; clusters: OtodomPropertyCluster[] }> {
  const requestBody = buildSearchMapPinsRequest(bounds, filters, estateType);
  const stopTimer = createTimer('otodom:fetch-single-type');

  const data = await otodomPost<OtodomSearchMapPinsResponse>(requestBody, signal, 'Otodom SearchMapPins');
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
  filters: OtodomPropertyFilters,
  signal?: AbortSignal
): Promise<OtodomPropertyResponse> {
  const stopTotalTimer = createTimer('otodom:fetch-total');
  const cacheKey = generatePropertyCacheKey(bounds, filters);

  // Check cache (Redis with in-memory fallback)
  const cached = await cacheGet<OtodomPropertyResponse>(cacheKey);
  if (cached) {
    logPerf('otodom:cache-hit', 0, { cacheKey: cacheKey.substring(0, 50) });
    return { ...cached, cached: true };
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
  const allClusters: OtodomPropertyCluster[] = [];
  const seenPropertyIds = new Set<number>();

  for (const result of results) {
    for (const property of result.properties) {
      if (!seenPropertyIds.has(property.id)) {
        seenPropertyIds.add(property.id);
        allProperties.push(property);
      }
    }
    allClusters.push(...result.clusters);
  }
  stopMergeTimer({ properties: allProperties.length, clusters: allClusters.length });

  const clusterTotal = allClusters.reduce((sum, c) => sum + c.count, 0);
  const totalCount = allProperties.length > 0 ? allProperties.length : clusterTotal;

  const result: OtodomPropertyResponse = {
    properties: allProperties,
    clusters: allClusters,
    totalCount,
    cached: false,
    fetchedAt: new Date().toISOString(),
  };

  // Update cache (Redis with in-memory fallback, 1 hour TTL)
  await cacheSet(cacheKey, result, CACHE_CONFIG.PROPERTY_API_TTL_SECONDS);

  stopTotalTimer({ properties: allProperties.length, clusters: allClusters.length, estateTypes: estateTypes.length });
  return result;
}

/**
 * Build a GeoJSON polygon around a center point
 */
function buildGeoJsonAroundPoint(lat: number, lng: number, radiusMeters: number = OTODOM_CLUSTER_RADIUS_METERS): string {
  const latOffset = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngOffset = radiusMeters / metersPerDegreeLng(lat);

  const geoJson = {
    type: 'Polygon',
    coordinates: [[
      [lng - lngOffset, lat + latOffset],
      [lng + lngOffset, lat + latOffset],
      [lng + lngOffset, lat - latOffset],
      [lng - lngOffset, lat - latOffset],
      [lng - lngOffset, lat + latOffset],
    ]],
  };

  return JSON.stringify(geoJson);
}

/**
 * Build the GraphQL request body for SearchMapQuery
 */
function buildSearchMapQueryRequest(
  geoJson: string,
  filters: OtodomPropertyFilters,
  estateType: OtodomEstateType,
  page: number = 1,
  limit: number = 36
): object {
  const filterAttributes: Record<string, unknown> = {
    estate: estateType,
    transaction: filters.transaction,
    market: filters.market ?? 'ALL',
    ownerTypeSingleSelect: filters.ownerType ?? 'ALL',
    areaMin: filters.areaMin,
    areaMax: filters.areaMax,
  };

  addCommonFilters(filterAttributes, filters);

  return {
    extensions: {
      persistedQuery: {
        sha256Hash: OTODOM_SEARCH_MAP_QUERY_HASH,
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
 * Fetch properties within a cluster area using SearchMapQuery API
 */
export async function fetchClusterProperties(
  lat: number,
  lng: number,
  filters: OtodomPropertyFilters,
  page: number = 1,
  limit: number = OTODOM_DEFAULT_CLUSTER_PAGE_LIMIT,
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
  const geoJson = shape || buildGeoJsonAroundPoint(lat, lng, radiusMeters);

  const estateTypes = clusterEstateType
    ? [validateEstateType(clusterEstateType)]
    : (filters.estate ?? ['FLAT']);

  const allProperties: OtodomProperty[] = [];
  let totalCount = 0;
  let totalPages = 1;
  const seenPropertyIds = new Set<number>();

  const fetchResults = await Promise.all(
    estateTypes.map(async (estateType) => {
      const requestBody = buildSearchMapQueryRequest(geoJson, filters, estateType, page, limit);
      const data = await otodomPost<OtodomSearchAdsResponse>(requestBody, signal, 'Otodom SearchMapQuery');

      if (!data?.data?.searchAds) {
        console.warn('Otodom API returned empty or invalid response for estate type:', estateType);
        return null;
      }

      return transformSearchAdsResponse(data, lat, lng);
    })
  );

  for (const result of fetchResults) {
    if (!result) continue;

    for (const property of result.properties) {
      if (!seenPropertyIds.has(property.id)) {
        seenPropertyIds.add(property.id);
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
