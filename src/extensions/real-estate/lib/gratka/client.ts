/**
 * Gratka.pl API Client
 *
 * GraphQL client for the Gratka.pl real estate API at https://gratka.pl/api-gratka
 * Based on reverse-engineered API contracts from 150 captured requests.
 *
 * ## API Coverage
 *
 * ### IMPLEMENTED APIs (used in this client):
 * - encodeListingParameters - Convert search params to URL, get total count
 * - getPropertyListingData - Fetch full listing page with properties
 * - searchMap - Map-based search with clustering
 * - getLocationSuggestions - Location autocomplete
 *
 * ### IMPLEMENTED BUT NOT USED in current integration:
 * - decodeListingUrl - Parse URL back to search parameters
 * - getTopPromotedProperty - Fetch promoted/featured listings
 * - addPropertyViewOnListingStatistic - Track property views (analytics)
 *
 * ### API DIFFERENCES from Otodom:
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
  GratkaDecodeListingUrlResponse,
  GratkaPropertyListingDataResponse,
  GratkaPropertyClusterDataResponse,
  GratkaGetMarkersResponse,
  GratkaTopPromotedResponse,
  GratkaSearchMapResponse,
  GratkaLocationSuggestionsResponse,
  GratkaAddPropertyViewResponse,
  GratkaGraphQLResponse,
  GratkaPropertyType,
  GratkaTransactionType,
} from './types';
import {
  GRATKA_API_URL as CONFIG_GRATKA_API_URL,
  GRATKA_CACHE_TTL_MS,
  GRATKA_MAX_CACHE_ENTRIES,
  GRATKA_DEFAULT_PAGE_SIZE,
  GRATKA_DEFAULT_MAX_MARKERS,
  GRATKA_CLUSTER_RADIUS_METERS,
} from '../../config/constants';
import { createTimer, logPerf } from '@/lib/profiling';

// ============================================
// CONSTANTS
// ============================================

const GRATKA_API_URL = CONFIG_GRATKA_API_URL;

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
 * Module-level cache for property responses
 * 
 * Design note: This uses a simple Map with TTL-based eviction rather than a
 * full LRU cache. The cache is bounded by GRATKA_MAX_CACHE_ENTRIES and entries
 * expire after GRATKA_CACHE_TTL_MS. Old entries are evicted when the cache
 * exceeds the maximum size.
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const propertyCache = new Map<string, CacheEntry<GratkaPropertyListingDataResponse>>();
const clusterCache = new Map<string, CacheEntry<GratkaPropertyClusterDataResponse>>();
const mapMarkersCache = new Map<string, CacheEntry<GratkaSearchMapResponse>>();

/**
 * Generate a cache key from bounds and filters
 */
function generateCacheKey(
  bounds: { north: number; south: number; east: number; west: number },
  filters: {
    transaction?: GratkaTransactionType;
    propertyType?: GratkaPropertyType[];
    priceMin?: number;
    priceMax?: number;
    areaMin?: number;
    areaMax?: number;
    rooms?: number[];
  }
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
    filters.priceMax ?? 999999999,
    filters.areaMin ?? 0,
    filters.areaMax ?? 999,
    (filters.rooms ?? []).sort().join(','),
  ].join(':');

  return `gratka:${snappedBounds.south},${snappedBounds.west},${snappedBounds.north},${snappedBounds.east}:${filterKey}`;
}

/**
 * Check if a cache entry is still valid
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.timestamp < GRATKA_CACHE_TTL_MS;
}

/**
 * Evict old entries from a cache if it exceeds max size
 */
function evictOldEntries<T>(cache: Map<string, CacheEntry<T>>, maxEntries: number): void {
  if (cache.size > maxEntries) {
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - maxEntries);
    toDelete.forEach(([key]) => cache.delete(key));
  }
}

/**
 * Clear all Gratka caches
 */
export function clearGratkaCache(): void {
  propertyCache.clear();
  clusterCache.clear();
  mapMarkersCache.clear();
}

/**
 * Get Gratka cache statistics
 */
export function getGratkaCacheStats(): {
  properties: { size: number; maxSize: number };
  clusters: { size: number; maxSize: number };
  mapMarkers: { size: number; maxSize: number };
} {
  return {
    properties: { size: propertyCache.size, maxSize: GRATKA_MAX_CACHE_ENTRIES },
    clusters: { size: clusterCache.size, maxSize: GRATKA_MAX_CACHE_ENTRIES },
    mapMarkers: { size: mapMarkersCache.size, maxSize: GRATKA_MAX_CACHE_ENTRIES },
  };
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

const DECODE_LISTING_URL_QUERY = `
query decodeListingUrl($url: String!) {
  decodeListingUrl(url: $url) {
    url
    listingParameters {
      extraParameters {
        key
        value
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
      mode
      numberOfResults
      pageNumber
      searchOrder {
        sortKey
        sortOrder
      }
      searchParameters {
        addedAtFrom
        addedAtTo
        areaFrom
        areaTo
        attributes {
          balcony
          basement
          electricity
          elevator
          gas
          garden
          nonCesspitSewerage
          parkingPlaces
          threePhasePower
          terrace
          water
        }
        buildYearFrom
        buildYearTo
        completionDateFrom
        completionDateTo
        dateFrom
        description
        dictionaries
        floorFrom
        floorTo
        isLastFloor
        isTopPromoted
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
          radius
        }
        marketType
        numberOfFloorsFrom
        numberOfFloorsTo
        numberOfRooms
        numberOfRoomsFrom
        numberOfRoomsTo
        ownerType
        plotAreaFrom
        plotAreaTo
        priceFrom
        priceTo
        priceM2From
        priceM2To
        reference
        transaction
        type
        with3dView
        withDiscount
        withPhoto
        withPrice
      }
    }
    totalCount
  }
}`;

const GET_PROPERTY_LISTING_DATA_QUERY = `
query getPropertyListingData($url: String!) {
  blogPosts: getBlogPosts(url: $url) {
    title
    url
    photo: photoUrl {
      id
      name
      alt
    }
    content(maxLength: 300)
  }
  breadcrumbs: getBreadcrumbs(url: $url) {
    title
    nodes {
      title
      url
    }
  }
  headerTitle: getListingHeader(url: $url) {
    header
    subHeader
    count
    searchQuery
  }
  headTags: getListingHeadTags(url: $url) {
    link {
      href
      rel
      sizes
    }
    meta {
      content
      name
      property
    }
    script {
      innerHTML
      type
    }
    title
  }
  searchResult: searchProperties(url: $url) {
    adKeywords
    dataLayer
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
        description(maxLength: 300)
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
        photos {
          alt
          id
          name
        }
        photosNumber
        promotionPoints
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
    topPromoted {
      listingUrl
      topPromotedListingUrl
    }
  }
}`;

const GET_TOP_PROMOTED_PROPERTY_QUERY = `
query getTopPromotedProperty($url: String!) {
  searchProperties(url: $url) {
    topPromoted {
      listingUrl
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
        description(maxLength: 300)
        has3dView
        hasVideo
        id
        idOnFrontend
        isHighlighted
        floorFormatted
        location {
          location
          street
        }
        numberOfRooms
        photos {
          alt
          id
          name
        }
        photosNumber
        price {
          amount
        }
        priceFormatted
        priceM2Formatted
        promotionPoints
        title
        url
      }
      topPromotedListingUrl
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

const ADD_PROPERTY_VIEW_MUTATION = `
mutation addPropertyViewOnListingStatistic($ids: [Int]!, $sessionId: String!) {
  addPropertyViewOnListingStatistic(ids: $ids, sessionId: $sessionId)
}`;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a session ID in the format used by Gratka
 * Format: {8-char-alphanumeric}.ocr
 */
export function generateGratkaSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const randomPart = Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `${randomPart}.ocr`;
}

/**
 * Format a number as a Gratka price string (decimal format)
 */
export function formatGratkaPrice(price: number): string {
  return price.toFixed(2);
}

/**
 * Format a number as a Gratka area string (decimal format)
 */
export function formatGratkaArea(area: number): string {
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
   * Decode a listing URL back to search parameters
   */
  async decodeListingUrl(url: string, signal?: AbortSignal): Promise<GratkaDecodeListingUrlResponse> {
    const data = await this.execute<{
      decodeListingUrl: GratkaDecodeListingUrlResponse;
    }>(DECODE_LISTING_URL_QUERY, { url }, { signal });

    return data.decodeListingUrl;
  }

  /**
   * Get full property listing data
   */
  async getPropertyListingData(url: string, signal?: AbortSignal): Promise<GratkaPropertyListingDataResponse> {
    const data = await this.execute<GratkaPropertyListingDataResponse>(
      GET_PROPERTY_LISTING_DATA_QUERY,
      { url },
      { signal }
    );

    // #region agent log
    const firstProp = data.searchResult?.properties?.nodes?.[0];
    const locationKeys = firstProp?.location ? Object.keys(firstProp.location) : [];
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'client.ts:getPropertyListingData',message:'API response received',data:{propsCount:data.searchResult?.properties?.nodes?.length||0,locationKeys:locationKeys,firstPropLocation:firstProp?.location?{hasCoords:!!firstProp.location.coordinates,hasMap:!!firstProp.location.map,coords:firstProp.location.coordinates,mapCenter:firstProp.location.map?.center,locationArr:firstProp.location.location,street:firstProp.location.street}:'no-prop'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return data;
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
   * Get top promoted properties
   */
  async getTopPromotedProperty(url: string, signal?: AbortSignal): Promise<GratkaTopPromotedResponse> {
    const data = await this.execute<{
      searchProperties: GratkaTopPromotedResponse;
    }>(GET_TOP_PROMOTED_PROPERTY_QUERY, { url }, { signal });

    return data.searchProperties;
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

  /**
   * Track property views (analytics)
   */
  async addPropertyViewStatistic(
    propertyIds: number[],
    sessionId: string
  ): Promise<GratkaAddPropertyViewResponse> {
    const data = await this.execute<{
      addPropertyViewOnListingStatistic: GratkaAddPropertyViewResponse;
    }>(
      ADD_PROPERTY_VIEW_MUTATION,
      { ids: propertyIds, sessionId },
      { cache: false }
    );

    return data.addPropertyViewOnListingStatistic;
  }

  /**
   * Clear all Gratka caches
   */
  clearCache(): void {
    clearGratkaCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    properties: { size: number; maxSize: number };
    clusters: { size: number; maxSize: number };
    mapMarkers: { size: number; maxSize: number };
  } {
    return getGratkaCacheStats();
  }
}

// ============================================
// DEFAULT INSTANCE
// ============================================

/** Default Gratka client instance */
export const gratkaClient = new GratkaClient();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Fetch Gratka properties for a map bounds
 */
export async function fetchGratkaProperties(options: {
  bounds: { north: number; south: number; east: number; west: number };
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
  properties: GratkaPropertyListingDataResponse['searchResult']['properties']['nodes'];
  totalCount: number;
  url: string;
  cached: boolean;
}> {
  const stopTimer = createTimer('gratka:fetch-properties');
  const cacheKey = generateCacheKey(options.bounds, options);

  // Check cache
  const cached = propertyCache.get(cacheKey);
  if (isCacheValid(cached)) {
    logPerf('gratka:cache-hit', 0, { cacheKey: cacheKey.substring(0, 50) });
    return {
      properties: cached.data.searchResult.properties.nodes,
      totalCount: cached.data.searchResult.properties.totalCount,
      url: '',
      cached: true,
    };
  }

  const params = buildGratkaSearchParams(options);
  params.pageNumber = options.page ?? 1;
  params.numberOfResults = options.pageSize ?? GRATKA_DEFAULT_PAGE_SIZE;

  const encoded = await gratkaClient.encodeListingParameters(params);
  const listingData = await gratkaClient.getPropertyListingData(encoded.url);

  // Update cache
  propertyCache.set(cacheKey, { data: listingData, timestamp: Date.now() });
  evictOldEntries(propertyCache, GRATKA_MAX_CACHE_ENTRIES);

  stopTimer({ properties: listingData.searchResult.properties.nodes.length });

  return {
    properties: listingData.searchResult.properties.nodes,
    totalCount: listingData.searchResult.properties.totalCount,
    url: encoded.url,
    cached: false,
  };
}

/**
 * Fetch Gratka map markers for a map bounds
 */
export async function fetchGratkaMapMarkers(options: {
  bounds: { north: number; south: number; east: number; west: number };
  transaction?: GratkaTransactionType;
  propertyType?: GratkaPropertyType[];
  priceMin?: number;
  priceMax?: number;
  maxMarkers?: number;
  signal?: AbortSignal;
}): Promise<{ markers: GratkaSearchMapResponse['markers']; cached: boolean }> {
  const stopTimer = createTimer('gratka:fetch-markers');
  const cacheKey = `markers:${generateCacheKey(options.bounds, options)}`;

  // Check cache
  const cached = mapMarkersCache.get(cacheKey);
  if (isCacheValid(cached)) {
    logPerf('gratka:markers-cache-hit', 0, { cacheKey: cacheKey.substring(0, 50) });
    return { markers: cached.data.markers, cached: true };
  }

  const params = buildGratkaSearchParams(options);

  const result = await gratkaClient.searchMap(params, {
    numberOfMarkers: options.maxMarkers ?? GRATKA_DEFAULT_MAX_MARKERS,
    propertyIds: [],
  });

  // Update cache
  mapMarkersCache.set(cacheKey, { data: result, timestamp: Date.now() });
  evictOldEntries(mapMarkersCache, GRATKA_MAX_CACHE_ENTRIES);

  stopTimer({ markers: result.markers.length });

  return { markers: result.markers, cached: false };
}

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
    cacheKey = `cluster:${url}`;
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
      const METERS_PER_DEGREE = 111320; // Approximate meters per degree at equator
      const latOffset = radiusMeters / METERS_PER_DEGREE;
      const lngOffset = radiusMeters / (METERS_PER_DEGREE * Math.cos(options.lat * Math.PI / 180));

      bounds = {
        north: options.lat + latOffset,
        south: options.lat - latOffset,
        east: options.lng + lngOffset,
        west: options.lng - lngOffset,
      };
    }

    cacheKey = `cluster:${generateCacheKey(bounds, options)}`;

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

  // Check cache
  const cached = clusterCache.get(cacheKey);
  if (isCacheValid(cached)) {
    logPerf('gratka:cluster-cache-hit', 0, { cacheKey: cacheKey.substring(0, 50) });
    const totalCount = cached.data.searchResult.properties.totalCount;
    const pageSize = options.pageSize ?? GRATKA_DEFAULT_PAGE_SIZE;
    return {
      properties: cached.data.searchResult.properties.nodes,
      totalCount,
      currentPage: options.page ?? 1,
      totalPages: Math.ceil(totalCount / pageSize),
      url,
      cached: true,
    };
  }

  // Use the lightweight cluster data API
  const clusterData = await gratkaClient.getPropertyClusterData(url);

  // Update cache
  clusterCache.set(cacheKey, { data: clusterData, timestamp: Date.now() });
  evictOldEntries(clusterCache, GRATKA_MAX_CACHE_ENTRIES);

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

/**
 * Search Gratka locations (autocomplete)
 */
export async function searchGratkaLocations(
  query: string,
  options?: {
    propertyType?: GratkaPropertyType;
    transaction?: GratkaTransactionType;
    limit?: number;
  }
): Promise<GratkaLocationSuggestionsResponse['edges']> {
  const result = await gratkaClient.getLocationSuggestions({
    searchQuery: query,
    propertyType: options?.propertyType ?? 'FLAT',
    propertyTransaction: options?.transaction ?? 'SALE',
    first: options?.limit ?? 10,
    after: null,
  });

  return result.edges;
}

/**
 * Fetch property details by IDs
 *
 * Convenience function to get full property data for one or more properties.
 * Useful for:
 * - Getting property details when clicking on a single marker
 * - Fetching details for all properties in a cluster using marker.ids
 *
 * @param ids - Array of property IDs (numbers or strings)
 * @returns Array of property details
 */
export async function fetchGratkaPropertiesByIds(
  ids: (number | string)[]
): Promise<GratkaGetMarkersResponse['properties']> {
  // Convert all IDs to strings as required by the API
  const stringIds = ids.map(id => String(id));
  
  const result = await gratkaClient.getMarkers(stringIds);
  return result.properties;
}
