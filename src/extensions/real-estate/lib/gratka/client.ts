/**
 * Gratka.pl API Client
 *
 * GraphQL client for the Gratka.pl real estate API at https://gratka.pl/api-gratka
 * Based on reverse-engineered API contracts.
 *
 * ## API Coverage
 *
 * - encodeListingParameters - Convert search params to URL, get total count
 * - getPropertyClusterData - Lightweight property fetch for cluster expansion
 * - getMarkers - Fetch property details by IDs
 * - searchMap - Map-based search with clustering
 * - getLocationSuggestions - Location autocomplete
 *
 * ## API Differences from Otodom
 *
 * - Location: Uses MapBounds (NE/SW) instead of GeoJSON polygon
 * - Prices: Decimal strings ("100000.00") instead of numbers
 * - Transaction: "SALE" instead of "SELL"
 * - Estate types: "PLOT" instead of "TERRAIN"
 * - Rooms: Number array instead of string enum
 * - Market/Owner: Arrays instead of single values
 * - Clustering: numberOfMarkers parameter instead of built-in grid
 */

import type {
  GratkaClientConfig,
  GratkaListingParametersInput,
  GratkaMarkerConfiguration,
  GratkaLocationSuggestionsInput,
  GratkaEncodeListingParametersResponse,
  GratkaPropertyClusterDataResponse,
  GratkaGetMarkersResponse,
  GratkaSearchMapResponse,
  GratkaLocationSuggestionsResponse,
  GratkaGraphQLResponse,
  GratkaPropertyType,
  GratkaTransactionType,
} from './types';
import {
  GRATKA_API_URL,
  GRATKA_DEFAULT_PAGE_SIZE,
  GRATKA_CLUSTER_RADIUS_METERS,
} from '../../config/constants';

// ============================================
// TYPES
// ============================================

/**
 * Filter options for cache key generation
 */
interface CacheKeyFilters {
  transaction?: GratkaTransactionType;
  propertyType?: GratkaPropertyType[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  rooms?: number[];
}
import { createTimer, logPerf } from '@/lib/profiling';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CACHE_CONFIG } from '@/constants/performance';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng } from '@/lib/geo';

const GRATKA_HEADERS: Record<string, string> = {
  accept: 'application/json',
  'content-type': 'application/json',
  'x-mzn-client': 'GRATKA',
  'x-mzn-type': 'GRATKA',
};

// ============================================
// CACHING
// ============================================

/**
 * Generate a cache key from bounds and filters
 */
function generateCacheKey(
  bounds: { north: number; south: number; east: number; west: number },
  filters: CacheKeyFilters
): string {
  // Snap bounds to 4 decimal places for cache efficiency
  const snappedBounds = {
    north: Math.round(bounds.north * 10000) / 10000,
    south: Math.round(bounds.south * 10000) / 10000,
    east: Math.round(bounds.east * 10000) / 10000,
    west: Math.round(bounds.west * 10000) / 10000,
  };

  const filterKey = [
    filters.transaction ?? 'SALE',
    (filters.propertyType ?? ['FLAT']).sort().join(','),
    filters.priceMin ?? 0,
    filters.priceMax ?? 0,
    filters.areaMin ?? 0,
    filters.areaMax ?? 0,
    (filters.rooms ?? []).sort().join(','),
  ].join(':');

  return `gratka:${snappedBounds.south},${snappedBounds.west},${snappedBounds.north},${snappedBounds.east}:${filterKey}`;
}

// ============================================
// GRAPHQL QUERIES
// ============================================

const ENCODE_LISTING_PARAMETERS_QUERY = `
query encodeListingParameters($parameters: ListingParametersInput!) {
  encodeListingParameters(parameters: $parameters) {
    url
    totalCount
    listingParameters {
      searchParameters {
        location {
          identifiers {
            id
            name
          }
          mapBounds {
            northeast {
              latitude
              longitude
            }
            southwest {
              latitude
              longitude
            }
          }
          mapArea {
            latitude
            longitude
          }
        }
      }
      locations {
        id
        mapBounds {
          northeast {
            latitude
            longitude
          }
          southwest {
            latitude
            longitude
          }
        }
        name
        nameFull
        nameLocCase
        type
        uniqueName
        uniqueUrlParts
        outline
      }
    }
  }
}`;

const GET_PROPERTY_CLUSTER_DATA_QUERY = `
query getPropertyClusterData($url: String!) {
  searchResult: searchProperties(url: $url) {
    hasTopPromoted
    properties {
      nodes {
        addedAt(format: "dd.MM.y")
        advertisementText
        area
        contact {
          company {
            address
            faxes
            id
            name
            logo {
              alt
              id
              name
            }
            phones
            type
          }
          person {
            faxes
            name
            phones
            photo {
              alt
              id
              name
            }
            type
            url
          }
        }
        development {
          id
          name
        }
        floorFormatted
        highlightText
        id
        idOnFrontend
        isHighlighted
        isRecommended
        location {
          location
          street
        }
        numberOfRooms
        photos (maxPhotoNumber: 1) {
          alt
          id
          name
        }
        photosNumber
        has3dView
        hasVideo
        plans {
          alt
          id
          name
        }
        price {
          amount
          currency
        }
        priceFormatted
        priceM2 {
          amount
          currency
        }
        priceM2Formatted
        promotionPoints
        title
        url
        servicePromocenaIsActive
        omnibusPreviousSalePrice {
          amount
          currency
        }
        omnibusPreviousLowestPrice {
          amount
          currency
        }
      }
      totalCount
    }
  }
}`;

const GET_MARKERS_QUERY = `
query getMarkers($ids: [String!]!) {
  properties: getMarkers(ids: $ids) {
    addedAt(format: "dd.MM.y")
    advertisementText
    area
    contact {
      company {
        address
        faxes
        name
        logo {
          alt
          id
          name
        }
        phones
        type
      }
      person {
        faxes
        name
        phones
        photo {
          alt
          id
          name
        }
        type
        url
      }
    }
    development {
      id
      name
    }
    floorFormatted
    highlightText
    id
    idOnFrontend
    isHighlighted
    isRecommended
    location {
      location
      street
    }
    numberOfRooms
    photos (maxPhotoNumber: 5) {
      alt
      id
      name
    }
    photosNumber
    has3dView
    hasVideo
    plans {
      alt
      id
      name
    }
    price {
      amount
      currency
    }
    priceFormatted
    priceM2 {
      amount
      currency
    }
    priceM2Formatted
    promotionPoints
    title
    url
    servicePromocenaIsActive
    omnibusPreviousSalePrice {
      amount
      currency
    }
    omnibusPreviousLowestPrice {
      amount
      currency
    }
  }
}`;

const SEARCH_MAP_QUERY = `
query searchMap($parameters: ListingParametersInput!, $configuration: MarkerConfigurationInput!) {
  searchMap(parameters: $parameters, configuration: $configuration) {
    markers {
      label
      southwest {
        latitude
        longitude
      }
      northeast {
        latitude
        longitude
      }
      position {
        latitude
        longitude
      }
      clustered
      count
      ids {
        id
        idOnFrontend
      }
      price
      url
      size {
        width
        height
      }
    }
  }
}`;

const GET_LOCATION_SUGGESTIONS_QUERY = `
query getLocationSuggestions(
  $after: String,
  $first: Int,
  $propertyTransaction: PropertyTransaction,
  $propertyType: PropertyType,
  $searchQuery: String,
) {
  getLocationSuggestions(
    after: $after,
    first: $first,
    propertyTransaction: $propertyTransaction,
    propertyType: $propertyType,
    searchQuery: $searchQuery,
  ) {
    edges {
      node {
        id
        name
        description
        suggestion
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}`;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format a number as a Gratka price string (decimal format)
 */
export function formatGratkaPrice(price: number): string {
  return price.toFixed(2);
}

/**
 * Format a number as a Gratka area string (decimal format)
 */
function formatGratkaArea(area: number): string {
  return area.toFixed(2);
}

/**
 * Build default search parameters with map bounds
 */
export function buildGratkaSearchParams(options: {
  bounds: { north: number; south: number; east: number; west: number };
  transaction?: GratkaTransactionType;
  propertyType?: GratkaPropertyType[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  rooms?: number[];
}): GratkaListingParametersInput {
  return {
    searchParameters: {
      transaction: options.transaction ?? 'SALE',
      type: options.propertyType ?? ['FLAT'],
      priceFrom: options.priceMin ? formatGratkaPrice(options.priceMin) : null,
      priceTo: options.priceMax ? formatGratkaPrice(options.priceMax) : null,
      areaFrom: options.areaMin ? formatGratkaArea(options.areaMin) : null,
      areaTo: options.areaMax ? formatGratkaArea(options.areaMax) : null,
      numberOfRooms: options.rooms ?? [],
      location: {
        identifiers: null,
        mapBounds: {
          northeast: {
            latitude: options.bounds.north,
            longitude: options.bounds.east,
          },
          southwest: {
            latitude: options.bounds.south,
            longitude: options.bounds.west,
          },
        },
        mapArea: null,
        radius: null,
      },
      attributes: {
        balcony: null,
        basement: null,
        elevator: null,
        garden: null,
        parkingPlaces: null,
        terrace: null,
        electricity: null,
        gas: null,
        water: null,
        nonCesspitSewerage: null,
        threePhasePower: null,
      },
      marketType: [],
      ownerType: [],
      dictionaries: [],
      addedAtFrom: null,
      addedAtTo: null,
      dateFrom: null,
      with3dView: null,
      withDiscount: null,
      withPhoto: null,
      withPrice: null,
      isTopPromoted: null,
      description: '',
      reference: null,
      buildYearFrom: null,
      buildYearTo: null,
      completionDateFrom: null,
      completionDateTo: null,
      floorFrom: null,
      floorTo: null,
      numberOfFloorsFrom: null,
      numberOfFloorsTo: null,
      isLastFloor: null,
      numberOfRoomsFrom: null,
      numberOfRoomsTo: null,
      plotAreaFrom: null,
      plotAreaTo: null,
      priceM2From: null,
      priceM2To: null,
    },
    extraParameters: [],
    searchOrder: {
      sortKey: 'PROMOTION_POINTS',
      sortOrder: 'ASC',
    },
    numberOfResults: 35,
    pageNumber: 1,
    isMapMode: false,
    mode: 'PROPERTY',
  };
}

// ============================================
// GRATKA CLIENT CLASS
// ============================================

/**
 * Gratka.pl API Client
 *
 * Provides methods to interact with the Gratka GraphQL API for real estate listings.
 */
export class GratkaClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: GratkaClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? GRATKA_API_URL;
    this.headers = {
      ...GRATKA_HEADERS,
      ...config.headers,
    };
  }

  /**
   * Execute a GraphQL query/mutation
   */
  private async execute<T>(
    query: string,
    variables: Record<string, unknown>,
    options?: { cache?: boolean; signal?: AbortSignal }
  ): Promise<T> {
    const headers = {
      ...this.headers,
      'x-mzn-cache-response': options?.cache !== false ? 'true' : 'false',
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Gratka API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as GratkaGraphQLResponse<T>;

    if (result.errors?.length) {
      throw new Error(`Gratka GraphQL error: ${result.errors[0].message}`);
    }

    return result.data;
  }

  /**
   * Encode listing parameters to URL and get total count
   */
  async encodeListingParameters(
    params: GratkaListingParametersInput,
    signal?: AbortSignal
  ): Promise<GratkaEncodeListingParametersResponse> {
    const data = await this.execute<{
      encodeListingParameters: GratkaEncodeListingParametersResponse;
    }>(ENCODE_LISTING_PARAMETERS_QUERY, { parameters: params }, { signal });

    return data.encodeListingParameters;
  }

  /**
   * Get property cluster data (lightweight)
   *
   * This is a lightweight alternative to getPropertyListingData that returns
   * only property data without blog posts, breadcrumbs, and SEO metadata.
   * Used for cluster expansion when clicking on a map cluster.
   */
  async getPropertyClusterData(url: string, signal?: AbortSignal): Promise<GratkaPropertyClusterDataResponse> {
    const data = await this.execute<GratkaPropertyClusterDataResponse>(
      GET_PROPERTY_CLUSTER_DATA_QUERY,
      { url },
      { signal }
    );

    return data;
  }

  /**
   * Get property details by IDs
   *
   * Fetches full property data for one or more properties by their IDs.
   * Useful for:
   * - Getting property details when clicking on a single marker
   * - Fetching details for all properties in a cluster using marker.ids
   *
   * @param ids - Array of property IDs (as strings, e.g., ["1541747667"])
   */
  async getMarkers(ids: string[], signal?: AbortSignal): Promise<GratkaGetMarkersResponse> {
    const data = await this.execute<GratkaGetMarkersResponse>(
      GET_MARKERS_QUERY,
      { ids },
      { signal }
    );

    return data;
  }

  /**
   * Search properties on map
   */
  async searchMap(
    params: GratkaListingParametersInput,
    config: GratkaMarkerConfiguration,
    signal?: AbortSignal
  ): Promise<GratkaSearchMapResponse> {
    const data = await this.execute<{
      searchMap: GratkaSearchMapResponse;
    }>(SEARCH_MAP_QUERY, {
      parameters: { ...params, isMapMode: true },
      configuration: config,
    }, { signal });

    return data.searchMap;
  }

  /**
   * Get location suggestions (autocomplete)
   */
  async getLocationSuggestions(
    options: GratkaLocationSuggestionsInput,
    signal?: AbortSignal
  ): Promise<GratkaLocationSuggestionsResponse> {
    const data = await this.execute<{
      getLocationSuggestions: GratkaLocationSuggestionsResponse;
    }>(GET_LOCATION_SUGGESTIONS_QUERY, {
      after: options.after ?? null,
      first: options.first ?? 10,
      searchQuery: options.searchQuery,
      propertyType: options.propertyType ?? 'FLAT',
      propertyTransaction: options.propertyTransaction ?? 'SALE',
    }, { signal });

    return data.getLocationSuggestions;
  }

}

// ============================================
// DEFAULT INSTANCE
// ============================================

/** Default Gratka client instance */
export const gratkaClient = new GratkaClient();

/**
 * Fetch properties within a cluster area
 *
 * Equivalent to Otodom's fetchClusterProperties - fetches individual properties
 * when a user clicks on a cluster marker.
 *
 * Supports two modes:
 * 1. Direct URL mode: Pass `clusterUrl` from marker.url for best performance
 * 2. Bounds mode: Pass cluster bounds or center point to build the search area
 *
 * Uses the lightweight getPropertyClusterData API which returns only property
 * data without blog posts, breadcrumbs, and SEO metadata.
 */
export async function fetchGratkaClusterProperties(options: {
  /** Direct cluster URL from marker.url (preferred - most efficient) */
  clusterUrl?: string;
  /** Cluster center latitude (used if clusterUrl not provided) */
  lat?: number;
  /** Cluster center longitude (used if clusterUrl not provided) */
  lng?: number;
  /** Cluster bounding box (from marker.southwest/northeast) */
  clusterBounds?: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  /** Fallback radius in meters if no bounds provided */
  radiusMeters?: number;
  transaction?: GratkaTransactionType;
  propertyType?: GratkaPropertyType[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  rooms?: number[];
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}): Promise<{
  properties: GratkaPropertyClusterDataResponse['searchResult']['properties']['nodes'];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  url: string;
  cached: boolean;
}> {
  const stopTimer = createTimer('gratka:fetch-cluster-properties');
  let url: string;
  let cacheKey: string;

  if (options.clusterUrl) {
    // Direct URL mode - most efficient, use the URL from marker.url
    url = options.clusterUrl;
    cacheKey = `gratka:cluster:url:${url}`;
  } else {
    // Bounds mode - build URL from coordinates
    if (options.lat === undefined || options.lng === undefined) {
      throw new Error('Either clusterUrl or lat/lng must be provided');
    }

    // Use cluster bounds if available, otherwise create bounds from radius
    let bounds: { north: number; south: number; east: number; west: number };

    if (options.clusterBounds) {
      bounds = options.clusterBounds;
    } else {
      // Default radius: ~500 meters (similar to Otodom's OTODOM_CLUSTER_RADIUS_METERS)
      const radiusMeters = options.radiusMeters ?? GRATKA_CLUSTER_RADIUS_METERS;
      const latOffset = radiusMeters / METERS_PER_DEGREE_LAT;
      const lngOffset = radiusMeters / metersPerDegreeLng(options.lat);

      bounds = {
        north: options.lat + latOffset,
        south: options.lat - latOffset,
        east: options.lng + lngOffset,
        west: options.lng - lngOffset,
      };
    }

    cacheKey = `gratka:cluster:${generateCacheKey(bounds, options)}`;

    const params = buildGratkaSearchParams({
      bounds,
      transaction: options.transaction,
      propertyType: options.propertyType,
      priceMin: options.priceMin,
      priceMax: options.priceMax,
      areaMin: options.areaMin,
      areaMax: options.areaMax,
      rooms: options.rooms,
    });

    params.pageNumber = options.page ?? 1;
    params.numberOfResults = options.pageSize ?? GRATKA_DEFAULT_PAGE_SIZE;

    const encoded = await gratkaClient.encodeListingParameters(params);
    url = encoded.url;
  }

  // Check cache (Redis with in-memory fallback)
  const cached = await cacheGet<GratkaPropertyClusterDataResponse>(cacheKey);
  if (cached) {
    logPerf('gratka:cluster-cache-hit', 0, { cacheKey: cacheKey.substring(0, 50) });
    const totalCount = cached.searchResult.properties.totalCount;
    const pageSize = options.pageSize ?? GRATKA_DEFAULT_PAGE_SIZE;
    return {
      properties: cached.searchResult.properties.nodes,
      totalCount,
      currentPage: options.page ?? 1,
      totalPages: Math.ceil(totalCount / pageSize),
      url,
      cached: true,
    };
  }

  // Use the lightweight cluster data API
  const clusterData = await gratkaClient.getPropertyClusterData(url);

  // Update cache (Redis with in-memory fallback, 1 hour TTL)
  await cacheSet(cacheKey, clusterData, CACHE_CONFIG.PROPERTY_API_TTL_SECONDS);

  // Calculate total pages
  const totalCount = clusterData.searchResult.properties.totalCount;
  const pageSize = options.pageSize ?? GRATKA_DEFAULT_PAGE_SIZE;
  const totalPages = Math.ceil(totalCount / pageSize);

  stopTimer({ properties: clusterData.searchResult.properties.nodes.length });

  return {
    properties: clusterData.searchResult.properties.nodes,
    totalCount,
    currentPage: options.page ?? 1,
    totalPages,
    url,
    cached: false,
  };
}
