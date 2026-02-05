/**
 * Gratka.pl API Type Definitions
 * 
 * Types extracted from reverse-engineered GraphQL API at https://gratka.pl/api-gratka
 * Based on analysis of 150 captured requests.
 */

// ============================================
// ENUMS / UNION TYPES
// ============================================

/** Transaction type for property search */
export type GratkaTransactionType = 'SALE' | 'RENT';

/** Property type */
export type GratkaPropertyType = 'FLAT' | 'HOUSE' | 'PLOT' | 'COMMERCIAL' | 'GARAGE' | 'ROOM';

/** Owner/advertiser type */
export type GratkaOwnerType = 'AGENCY' | 'DEVELOPER' | 'PRIVATE' | 'COMMUNE';

/** Market type */
export type GratkaMarketType = 'PRIMARY' | 'SECONDARY';

/** Sort key options */
export type GratkaSortKey = 'PROMOTION_POINTS' | 'PRICE' | 'PRICE_M2' | 'AREA' | 'DATE';

/** Sort order */
export type GratkaSortOrder = 'ASC' | 'DESC';

/** Listing mode */
export type GratkaListingMode = 'PROPERTY' | 'DEVELOPMENT';

/** Contact type */
export type GratkaContactType = 'AGENCY' | 'AGENT' | 'DEVELOPER' | 'SALES_OFFICE' | 'PRIVATE';

/** Location type */
export type GratkaLocationType = 'VOIVODESHIP' | 'COUNTY' | 'COMMUNE' | 'CITY' | 'DISTRICT' | 'STREET';

// ============================================
// CORE TYPES
// ============================================

/** Geographic coordinates */
export interface GratkaCoordinates {
  latitude: number;
  longitude: number;
}

/** Map bounds (bounding box) */
export interface GratkaMapBounds {
  northeast: GratkaCoordinates;
  southwest: GratkaCoordinates;
}

/** Location identifier */
export interface GratkaLocationIdentifier {
  id: string;
  name: string;
}

// ============================================
// INPUT TYPES
// ============================================

/** Property attributes (amenities/features) */
export interface GratkaPropertyAttributes {
  balcony?: boolean | null;
  basement?: boolean | null;
  elevator?: boolean | null;
  garden?: boolean | null;
  parkingPlaces?: boolean | null;
  terrace?: boolean | null;
  electricity?: boolean | null;
  gas?: boolean | null;
  water?: boolean | null;
  nonCesspitSewerage?: boolean | null;
  threePhasePower?: boolean | null;
}

/** Location input for search */
export interface GratkaLocationInput {
  identifiers?: GratkaLocationIdentifier[] | null;
  mapBounds?: GratkaMapBounds | null;
  mapArea?: GratkaCoordinates[] | null;
  radius?: number | null;
}

/** Search parameters for property listings */
export interface GratkaSearchParameters {
  // Transaction & property type
  transaction?: GratkaTransactionType;
  type?: GratkaPropertyType[];

  // Price filters (decimal strings, e.g., "100000.00")
  priceFrom?: string | null;
  priceTo?: string | null;
  priceM2From?: string | null;
  priceM2To?: string | null;

  // Area filters (decimal strings, e.g., "50.00")
  areaFrom?: string | null;
  areaTo?: string | null;
  plotAreaFrom?: string | null;
  plotAreaTo?: string | null;

  // Room filters
  numberOfRooms?: number[];
  numberOfRoomsFrom?: number | null;
  numberOfRoomsTo?: number | null;

  // Floor filters (-1 for basement)
  floorFrom?: number | null;
  floorTo?: number | null;
  numberOfFloorsFrom?: number | null;
  numberOfFloorsTo?: number | null;
  isLastFloor?: boolean | null;

  // Building filters
  buildYearFrom?: number | null;
  buildYearTo?: number | null;
  completionDateFrom?: string | null;
  completionDateTo?: string | null;

  // Location
  location?: GratkaLocationInput;

  // Property attributes
  attributes?: GratkaPropertyAttributes;

  // Classification
  marketType?: GratkaMarketType[];
  ownerType?: GratkaOwnerType[];

  // Dictionary filters (2D array for building materials, types, etc.)
  dictionaries?: string[][];

  // Date filters (ISO date strings)
  addedAtFrom?: string | null;
  addedAtTo?: string | null;
  dateFrom?: string | null;

  // Feature filters
  with3dView?: boolean | null;
  withDiscount?: boolean | null;
  withPhoto?: boolean | null;
  withPrice?: boolean | null;
  isTopPromoted?: boolean | null;

  // Text search
  description?: string;
  reference?: string | null;
}

/** Search order configuration */
export interface GratkaSearchOrder {
  sortKey: GratkaSortKey;
  sortOrder: GratkaSortOrder;
}

/** Extra parameter (key-value pair) */
export interface GratkaExtraParameter {
  key: string;
  value: string;
}

/** Complete listing parameters input for GraphQL queries */
export interface GratkaListingParametersInput {
  searchParameters: GratkaSearchParameters;
  extraParameters?: GratkaExtraParameter[];
  searchOrder?: GratkaSearchOrder;
  numberOfResults?: number; // Default: 35
  pageNumber?: number; // 1-indexed
  isMapMode?: boolean;
  mode?: GratkaListingMode;
}

/** Marker configuration for map search */
export interface GratkaMarkerConfiguration {
  numberOfMarkers: number;
  propertyIds?: number[];
}

/** Location suggestions input */
export interface GratkaLocationSuggestionsInput {
  searchQuery: string;
  propertyType?: GratkaPropertyType;
  propertyTransaction?: GratkaTransactionType;
  first?: number;
  after?: string | null;
}

// ============================================
// RESPONSE TYPES
// ============================================

/** Image/photo */
export interface GratkaImage {
  id: string;
  name: string;
  alt: string;
}

/** Company contact */
export interface GratkaCompany {
  id: number;
  name: string;
  address: string[];
  faxes: string[];
  phones: string[];
  logo: GratkaImage | null;
  type: GratkaContactType;
}

/** Person contact */
export interface GratkaPerson {
  name: string;
  faxes: string[];
  phones: string[];
  photo: GratkaImage | null;
  type: GratkaContactType;
  url: string | null;
}

/** Contact information */
export interface GratkaContact {
  company: GratkaCompany | null;
  person: GratkaPerson | null;
}

/** Development/project info */
export interface GratkaDevelopment {
  id: number;
  name: string;
}

/** Price information */
export interface GratkaPrice {
  amount?: string;
  currency?: string;
  totalPrice?: string;
  pricePerSquareMeter?: string;
}

/** Price with amount (used in priceM2) */
export interface GratkaPriceAmount {
  amount: string;
  currency: string;
}

/** Property location */
export interface GratkaPropertyLocation {
  city?: string | null;
  district?: string | null;
  province?: string | null;
  region?: string | null;
  street?: string | null;
  address?: string | null;
  coordinates?: GratkaCoordinates | null;
  location?: string[];
  map?: { center: GratkaCoordinates };
}

/** Property node (main property type) */
export interface GratkaPropertyNode {
  id: number;
  idOnFrontend: string;
  title: string;
  advertisementText: string;
  description: string;
  url: string;
  addedAt: string;
  area: string;
  price: GratkaPrice;
  priceFormatted?: string;
  priceM2?: GratkaPriceAmount | null;
  priceM2Formatted?: string;
  rooms?: number;
  numberOfRooms?: string;
  floorFormatted?: string;
  highlightText?: string;
  location: GratkaPropertyLocation;
  photos: GratkaImage[];
  photosNumber?: number;
  plans?: GratkaImage[];
  contact: GratkaContact;
  development: GratkaDevelopment | null;
  propertyType?: GratkaPropertyType;
  transaction?: GratkaTransactionType;
  isPromoted?: boolean;
  isExclusive?: boolean;
  isHighlighted?: boolean;
  isRecommended?: boolean;
  has3dView?: boolean;
  hasVideo?: boolean;
  promotionPoints?: number;
  servicePromocenaIsActive?: boolean;
  omnibusPreviousSalePrice?: GratkaPriceAmount | null;
  omnibusPreviousLowestPrice?: GratkaPriceAmount | null;
}

/** Map marker */
export interface GratkaMapMarker {
  label: string;
  position: GratkaCoordinates;
  southwest: GratkaCoordinates | null;
  northeast: GratkaCoordinates | null;
  clustered: boolean;
  count: number;
  ids: { id: number; idOnFrontend: string }[];
  price: string | null;
  url: string | null;
  size: { width: number; height: number };
}

/** Location info (from search results) */
export interface GratkaLocationInfo {
  id: string;
  name: string;
  nameFull: string;
  nameLocCase: string;
  type: GratkaLocationType;
  uniqueName: string;
  uniqueUrlParts: string[];
  outline: string | null;
  mapBounds: GratkaMapBounds;
}

/** Location suggestion */
export interface GratkaLocationSuggestion {
  id: string;
  name: string;
  description: string;
  suggestion: string;
}

/** Page info for cursor pagination */
export interface GratkaPageInfo {
  endCursor: string | null;
  hasNextPage: boolean;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/** Response from encodeListingParameters */
export interface GratkaEncodeListingParametersResponse {
  url: string;
  totalCount: number;
  listingParameters: {
    searchParameters: {
      location: GratkaLocationInput | null;
    };
    locations: GratkaLocationInfo[];
  };
}

/** Response from searchMap */
export interface GratkaSearchMapResponse {
  markers: GratkaMapMarker[];
}

/** Response from getLocationSuggestions */
export interface GratkaLocationSuggestionsResponse {
  edges: { node: GratkaLocationSuggestion }[];
  pageInfo: GratkaPageInfo;
}

// ============================================
// GRAPHQL TYPES
// ============================================

/** GraphQL error */
export interface GratkaGraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: string[];
  extensions?: Record<string, unknown>;
}

/** GraphQL response wrapper */
export interface GratkaGraphQLResponse<T> {
  data: T;
  errors?: GratkaGraphQLError[];
}

// ============================================
// CLUSTER DATA TYPES
// ============================================

/**
 * Response from getPropertyClusterData query
 * 
 * This is a lightweight alternative to getPropertyListingData that returns
 * only property data without blog posts, breadcrumbs, and SEO metadata.
 * Used for cluster expansion when clicking on a map cluster.
 */
export interface GratkaPropertyClusterDataResponse {
  searchResult: {
    hasTopPromoted: boolean;
    properties: {
      nodes: GratkaPropertyNode[];
      totalCount: number;
    };
  };
}

/**
 * Response from getMarkers query
 * 
 * Fetches property details by ID. Useful for:
 * - Getting full property data when clicking on a single marker
 * - Fetching details for properties in a cluster using marker.ids
 */
export interface GratkaGetMarkersResponse {
  properties: GratkaPropertyNode[];
}

// ============================================
// CLIENT TYPES
// ============================================

/** Client configuration */
export interface GratkaClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
}
