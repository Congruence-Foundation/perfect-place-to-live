/**
 * Unified Property Types for Multi-Source Real Estate Data
 *
 * These types provide a source-agnostic interface for property data,
 * allowing consumers to work with properties from Otodom, Gratka, or
 * any future data source without knowing the underlying API details.
 */

import type { Bounds } from '@/types/poi';
import type { PropertyDataSource } from '../../config/filters';

// ============================================================================
// Unified Property Types
// ============================================================================

/**
 * Unified property image format
 */
export interface UnifiedPropertyImage {
  /** Medium-sized image URL (for thumbnails/lists) */
  medium: string;
  /** Large image URL (for detail views) */
  large: string;
}

/**
 * Unified property type (source-agnostic)
 *
 * This is the canonical property format used throughout the application.
 * Adapters convert source-specific formats (Otodom, Gratka) to this type.
 */
export interface UnifiedProperty {
  /** Unique ID prefixed with source: "otodom:123" or "gratka:456" */
  id: string;
  /** Original numeric ID from the source */
  sourceId: number;
  /** Data source this property came from */
  source: PropertyDataSource;

  // Location
  lat: number;
  lng: number;

  // Basic info
  title: string;
  url: string;

  // Price (null if hidden/unavailable)
  price: number | null;
  pricePerMeter: number | null;
  currency: string;

  // Property details
  area: number;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;

  // Media
  images: UnifiedPropertyImage[];

  // Metadata
  isPromoted: boolean;
  createdAt: string;

  // Estate classification
  estateType: UnifiedEstateType;
  transaction: UnifiedTransactionType;

  /**
   * Original source-specific data preserved for advanced use cases.
   * Use with caution - prefer unified fields when possible.
   */
  rawData: unknown;
}

/**
 * Unified cluster type for map markers
 */
export interface UnifiedCluster {
  /** Cluster center latitude */
  lat: number;
  /** Cluster center longitude */
  lng: number;
  /** Number of properties in cluster */
  count: number;
  /** Optional bounding box of clustered properties */
  bounds?: Bounds;
  /** Data source this cluster came from */
  source: PropertyDataSource;
  /** Optional cluster shape (GeoJSON polygon string) */
  shape?: string;
  /** Radius in meters (for circular clusters) */
  radiusInMeters?: number;
  /** Estate type if cluster is type-specific */
  estateType?: UnifiedEstateType;
  /** Direct URL to fetch cluster properties (Gratka-specific, more efficient than bounds) */
  url?: string;
  /** Original source-specific data */
  rawData?: unknown;
}

// ============================================================================
// Unified Enum Types
// ============================================================================

/**
 * Unified transaction type
 * - SELL: Property for sale
 * - RENT: Property for rent
 */
export type UnifiedTransactionType = 'SELL' | 'RENT';

/**
 * Unified estate/property type
 * Maps from source-specific types:
 * - FLAT: Apartment/flat (Otodom: FLAT, Gratka: FLAT)
 * - HOUSE: House (Otodom: HOUSE, Gratka: HOUSE)
 * - TERRAIN: Land/plot (Otodom: TERRAIN, Gratka: PLOT)
 * - COMMERCIAL: Commercial property
 * - ROOM: Single room
 * - GARAGE: Garage/parking
 */
export type UnifiedEstateType = 'FLAT' | 'HOUSE' | 'TERRAIN' | 'COMMERCIAL' | 'ROOM' | 'GARAGE';

/**
 * Unified market type
 */
export type UnifiedMarketType = 'ALL' | 'PRIMARY' | 'SECONDARY';

/**
 * Unified owner type for filtering
 *
 * Note: Gratka has additional 'COMMUNE' type for municipal/government properties.
 * When filtering with 'ALL', adapters should pass empty array to Gratka.
 *
 * Mapping:
 * - ALL: No filter (Otodom: 'ALL', Gratka: [])
 * - PRIVATE: Private sellers (both sources)
 * - DEVELOPER: Property developers (both sources)
 * - AGENCY: Real estate agencies (both sources)
 * - COMMUNE: Municipal/government (Gratka only, ignored by Otodom)
 */
export type UnifiedOwnerType = 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY' | 'COMMUNE';

/**
 * Unified sort key for search results
 *
 * Mapping:
 * - RELEVANCE: Default/promoted (Otodom: DEFAULT, Gratka: PROMOTION_POINTS)
 * - PRICE_ASC: Price low to high
 * - PRICE_DESC: Price high to low
 * - PRICE_M2_ASC: Price per m² low to high (Gratka only)
 * - PRICE_M2_DESC: Price per m² high to low (Gratka only)
 * - AREA_ASC: Area small to large
 * - AREA_DESC: Area large to small
 * - DATE_DESC: Newest first
 * - DATE_ASC: Oldest first
 */
export type UnifiedSortKey =
  | 'RELEVANCE'
  | 'PRICE_ASC'
  | 'PRICE_DESC'
  | 'PRICE_M2_ASC'
  | 'PRICE_M2_DESC'
  | 'AREA_ASC'
  | 'AREA_DESC'
  | 'DATE_ASC'
  | 'DATE_DESC';

/**
 * Unified contact type (for property listings)
 *
 * This represents who is selling/renting the property.
 * Different from owner type filter - this is what's returned in responses.
 *
 * Mapping:
 * - AGENCY: Real estate agency
 * - AGENT: Individual agent (Gratka only)
 * - DEVELOPER: Property developer
 * - SALES_OFFICE: Developer's sales office (Gratka only)
 * - PRIVATE: Private seller
 */
export type UnifiedContactType = 'AGENCY' | 'AGENT' | 'DEVELOPER' | 'SALES_OFFICE' | 'PRIVATE';

// ============================================================================
// Unified Search Parameters
// ============================================================================

/**
 * Unified search parameters for property queries
 *
 * This is the canonical format for search parameters. Adapters convert
 * these to source-specific formats (GeoJSON for Otodom, MapBounds for Gratka).
 */
export interface UnifiedSearchParams {
  /** Geographic bounds to search within */
  bounds: Bounds;

  /** Transaction type (SELL or RENT) */
  transaction: UnifiedTransactionType;

  /** Property types to include */
  propertyTypes: UnifiedEstateType[];

  // Price filters (in PLN or local currency)
  priceMin?: number;
  priceMax?: number;
  pricePerMeterMin?: number;
  pricePerMeterMax?: number;

  // Area filters (in square meters)
  areaMin?: number;
  areaMax?: number;

  // Room filter (as numbers: 1, 2, 3, etc.)
  rooms?: number[];

  // Building filters
  buildYearMin?: number;
  buildYearMax?: number;
  floorMin?: number;
  floorMax?: number;

  // Classification filters
  market?: UnifiedMarketType;
  owner?: UnifiedOwnerType;

  // Sorting
  sort?: UnifiedSortKey;

  // Pagination
  page?: number;
  pageSize?: number;

  // Abort signal for cancellation
  signal?: AbortSignal;
}

// ============================================================================
// Unified Response Types
// ============================================================================

/**
 * Unified search result
 */
export interface UnifiedSearchResult {
  /** Properties found (individual listings) */
  properties: UnifiedProperty[];
  /** Clusters (when zoomed out) */
  clusters: UnifiedCluster[];
  /** Total count of matching properties */
  totalCount: number;
  /** Whether result was served from cache */
  cached: boolean;
  /** Timestamp when data was fetched */
  fetchedAt: string;
  /** Data source(s) that contributed to this result */
  sources: PropertyDataSource[];
}

/**
 * Location suggestion for autocomplete
 */
export interface UnifiedLocationSuggestion {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Full description (e.g., "Warszawa, mazowieckie") */
  description: string;
  /** Data source */
  source: PropertyDataSource;
}

// ============================================================================
// Shared Utility Functions
// ============================================================================

/**
 * Create a unified property ID from source and numeric ID
 */
export function createUnifiedId(source: PropertyDataSource, id: number): string {
  return `${source}:${id}`;
}

// ============================================================================
// Price Analysis Types (Source-Agnostic)
// ============================================================================

/**
 * Location quality tier based on heatmap score
 * Represents 20% windows of location quality
 */
export type LocationQualityTier = '0-20' | '20-40' | '40-60' | '60-80' | '80-100';

/**
 * Price category based on comparison with similar properties
 */
export type PriceCategory = 'great_deal' | 'good_deal' | 'fair' | 'above_avg' | 'overpriced' | 'no_data';

/**
 * Price analysis result for a property
 * 
 * This is computed by comparing a property's price per m² against
 * similar properties in the same location quality tier.
 */
export interface PropertyPriceAnalysis {
  /** Price score in standard deviations from median (-3 to +3 typical range) */
  priceScore: number;
  /** Categorized price assessment */
  priceCategory: PriceCategory;
  /** Median price per m² in the comparison group */
  groupMedianPrice: number;
  /** Number of properties in the comparison group */
  groupSize: number;
  /** Percentile rank (0-100) - lower means cheaper */
  percentile: number;
  /** Percentage difference from median price */
  percentFromMedian: number;
  /** Location quality tier used for comparison */
  locationQualityTier: LocationQualityTier;
  /** Human-readable comparison group description */
  comparisonGroup: string;
}

/**
 * Unified property enriched with price analysis
 * 
 * This extends UnifiedProperty with optional price analysis data
 * computed by comparing against similar properties.
 */
export interface EnrichedUnifiedProperty extends UnifiedProperty {
  /** Price analysis data (computed client-side) */
  priceAnalysis?: PropertyPriceAnalysis;
}

/**
 * Type guard to check if a property is enriched with price analysis
 */
export function isEnrichedUnifiedProperty(
  property: UnifiedProperty | EnrichedUnifiedProperty
): property is EnrichedUnifiedProperty {
  return 'priceAnalysis' in property;
}

/**
 * Price value filter options for UI
 */
export type PriceValueFilter = 'great_deal' | 'good_deal' | 'fair' | 'above_avg' | 'overpriced' | 'all';

/**
 * Price value range for filtering (0-100 scale)
 */
export type PriceValueRange = [number, number];
