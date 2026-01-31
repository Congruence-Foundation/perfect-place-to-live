import { Bounds } from '@/types';
import {
  OtodomProperty,
  PropertyFilters,
  PropertyResponse,
  PropertyCluster,
  RoomCount,
} from '@/types/property';

/**
 * Otodom GraphQL API configuration
 */
const OTODOM_API_URL = 'https://www.otodom.pl/api/query';
const SEARCH_MAP_PINS_HASH = '51e8703aff1dd9b3ad3bae1ab6c543254e19b3576da1ee23eba0dca2b9341e27';

/**
 * Cache for property responses
 * Key: hash of bounds + filters
 * Value: { data, timestamp }
 */
const propertyCache = new Map<string, { data: PropertyResponse; timestamp: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Generate a cache key from bounds and filters
 */
export function generatePropertyCacheKey(bounds: Bounds, filters: PropertyFilters): string {
  // Snap bounds to reduce cache misses (round to 2 decimal places)
  const snappedBounds = {
    north: Math.ceil(bounds.north * 100) / 100,
    south: Math.floor(bounds.south * 100) / 100,
    east: Math.ceil(bounds.east * 100) / 100,
    west: Math.floor(bounds.west * 100) / 100,
  };

  const filterKey = [
    filters.transaction,
    filters.estate,
    filters.priceMin ?? 0,
    filters.priceMax ?? 999999999,
    filters.areaMin ?? 0,
    filters.areaMax ?? 999,
    (filters.roomsNumber ?? []).sort().join(','),
    filters.ownerType ?? 'ALL',
    filters.market ?? 'ALL',
    // Estate-specific filters
    filters.estate === 'FLAT' ? (filters.floors ?? []).sort().join(',') : '',
    filters.estate === 'FLAT' ? (filters.flatBuildingType ?? []).sort().join(',') : '',
    filters.estate === 'HOUSE' ? `${filters.terrainAreaMin ?? 0}-${filters.terrainAreaMax ?? 999999}` : '',
    filters.estate === 'HOUSE' ? (filters.houseBuildingType ?? []).sort().join(',') : '',
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
 * Convert room count filter to Otodom format
 */
function mapRoomCounts(rooms?: RoomCount[]): string[] | undefined {
  if (!rooms || rooms.length === 0) return undefined;
  return rooms;
}

/**
 * Build the GraphQL request body for SearchMapPins
 */
export function buildSearchMapPinsRequest(bounds: Bounds, filters: PropertyFilters): object {
  const geoJson = buildGeoJsonFromBounds(bounds);

  const filterAttributes: Record<string, unknown> = {
    estate: filters.estate,
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
    filterAttributes.roomsNumber = mapRoomCounts(filters.roomsNumber);
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

  // FLAT-specific filters
  if (filters.estate === 'FLAT') {
    if (filters.floors && filters.floors.length > 0) {
      filterAttributes.floors = filters.floors;
    }
    if (filters.floorsNumberMin !== undefined) filterAttributes.floorsNumberMin = filters.floorsNumberMin;
    if (filters.floorsNumberMax !== undefined) filterAttributes.floorsNumberMax = filters.floorsNumberMax;
    if (filters.flatBuildingType && filters.flatBuildingType.length > 0) {
      filterAttributes.buildingType = filters.flatBuildingType;
    }
  }

  // HOUSE-specific filters
  if (filters.estate === 'HOUSE') {
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
function transformOtodomResponse(response: OtodomSearchMapPinsResponse): { properties: OtodomProperty[]; clusters: PropertyCluster[] } {
  const properties: OtodomProperty[] = [];
  const clusters: PropertyCluster[] = [];

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
          });
        }
      }
    }
  }

  return { properties, clusters };
}

/**
 * Fetch properties from Otodom API
 * This function is meant to be called from the server-side API route
 */
export async function fetchOtodomProperties(
  bounds: Bounds,
  filters: PropertyFilters,
  signal?: AbortSignal
): Promise<PropertyResponse> {
  const cacheKey = generatePropertyCacheKey(bounds, filters);
  
  // Check cache
  const cached = propertyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const requestBody = buildSearchMapPinsRequest(bounds, filters);

  const response = await fetch(OTODOM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://www.otodom.pl',
      'Referer': 'https://www.otodom.pl/',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('Otodom API error:', response.status, errorText);
    throw new Error(`Otodom API error: ${response.status} ${response.statusText}`);
  }

  const data: OtodomSearchMapPinsResponse = await response.json();
  const { properties, clusters } = transformOtodomResponse(data);

  // Calculate total count from properties + sum of cluster counts
  const clusterTotal = clusters.reduce((sum, c) => sum + c.count, 0);
  const totalCount = properties.length > 0 ? properties.length : clusterTotal;

  const result: PropertyResponse = {
    properties,
    clusters,
    totalCount,
    cached: false,
    fetchedAt: new Date().toISOString(),
  };

  // Update cache
  propertyCache.set(cacheKey, { data: result, timestamp: Date.now() });

  // Clean old cache entries (keep last 50)
  if (propertyCache.size > 50) {
    const entries = Array.from(propertyCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - 50);
    toDelete.forEach(([key]) => propertyCache.delete(key));
  }

  return result;
}
