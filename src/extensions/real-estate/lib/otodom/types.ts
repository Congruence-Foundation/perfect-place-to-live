/**
 * Otodom.pl API Type Definitions
 *
 * Types specific to the Otodom real estate API.
 * These are used internally by the Otodom client and adapter.
 */

import type { Bounds } from '@/types/poi';

// ============================================================================
// Enums / Union Types
// ============================================================================

/**
 * Transaction type for property listings
 */
export type OtodomTransactionType = 'SELL' | 'RENT';

/**
 * Property/estate type
 */
export type OtodomEstateType = 'FLAT' | 'HOUSE' | 'TERRAIN' | 'COMMERCIAL' | 'ROOM' | 'GARAGE';

/**
 * Owner type filter
 */
export type OtodomOwnerType = 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY';

/**
 * Market type filter
 */
export type OtodomMarketType = 'ALL' | 'PRIMARY' | 'SECONDARY';

/**
 * Room count options (matches Otodom API values)
 */
export type OtodomRoomCount = 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' | 'SIX' | 'SEVEN' | 'EIGHT' | 'NINE' | 'TEN' | 'MORE';

/**
 * Floor level options for apartments (FLAT)
 */
export type OtodomFloorLevel =
  | 'CELLAR'
  | 'GROUND'
  | 'FIRST'
  | 'SECOND'
  | 'THIRD'
  | 'FOURTH'
  | 'FIFTH'
  | 'SIXTH'
  | 'SEVENTH'
  | 'EIGHTH'
  | 'NINTH'
  | 'TENTH'
  | 'ABOVE_TENTH'
  | 'GARRET';

/**
 * Building type options for apartments (FLAT)
 */
export type OtodomFlatBuildingType =
  | 'BLOCK'
  | 'TENEMENT'
  | 'HOUSE'
  | 'INFILL'
  | 'RIBBON'
  | 'APARTMENT';

/**
 * Building type options for houses (HOUSE)
 */
export type OtodomHouseBuildingType =
  | 'DETACHED'
  | 'SEMI_DETACHED'
  | 'RIBBON'
  | 'TENEMENT'
  | 'RESIDENCE'
  | 'FARM';

/**
 * Building material options
 */
export type OtodomBuildingMaterial =
  | 'BRICK'
  | 'WOOD'
  | 'BREEZEBLOCK'
  | 'HYDROTON'
  | 'CONCRETE_PLATE'
  | 'CONCRETE'
  | 'SILIKAT'
  | 'CELLULAR_CONCRETE'
  | 'REINFORCED_CONCRETE'
  | 'OTHER';

/**
 * Property extras/features
 */
export type OtodomPropertyExtra =
  | 'BALCONY'
  | 'TERRACE'
  | 'GARAGE'
  | 'BASEMENT'
  | 'LIFT'
  | 'SEPARATE_KITCHEN'
  | 'GARDEN'
  | 'TWO_STOREY'
  | 'HAS_PHOTOS';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Price information
 */
export interface OtodomPrice {
  value: number;
  currency: string;
}

/**
 * Property image URLs
 */
export interface OtodomPropertyImage {
  medium: string;
  large: string;
}

/**
 * Property listing from Otodom
 */
export interface OtodomProperty {
  id: number;
  lat: number;
  lng: number;
  title: string;
  slug: string;
  estate: OtodomEstateType;
  transaction: OtodomTransactionType;
  totalPrice: OtodomPrice;
  pricePerMeter?: OtodomPrice;
  areaInSquareMeters: number;
  roomsNumber: string;
  floor?: number;
  buildYear?: number;
  images: OtodomPropertyImage[];
  isPromoted: boolean;
  hidePrice: boolean;
  createdAt: string;
  url: string;
}

/**
 * Filters for property search
 */
export interface OtodomPropertyFilters {
  transaction: OtodomTransactionType;
  estate: OtodomEstateType[]; // Allow multiple selection (FLAT, HOUSE, or both)
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsNumber?: OtodomRoomCount[];
  ownerType?: OtodomOwnerType;
  market?: OtodomMarketType;
  // Common filters
  pricePerMeterMin?: number;
  pricePerMeterMax?: number;
  buildYearMin?: number;
  buildYearMax?: number;
  buildingMaterial?: OtodomBuildingMaterial[];
  daysSinceCreated?: '1' | '3' | '7' | '14' | '30' | '90';
  extras?: OtodomPropertyExtra[];
  description?: string; // Fragment opisu (description search)
  // FLAT-specific filters
  floors?: OtodomFloorLevel[];
  floorsNumberMin?: number;
  floorsNumberMax?: number;
  flatBuildingType?: OtodomFlatBuildingType[];
  // HOUSE-specific filters
  terrainAreaMin?: number;
  terrainAreaMax?: number;
  houseBuildingType?: OtodomHouseBuildingType[];
  isBungalow?: boolean; // Dom parterowy (single-storey house)
}

/**
 * Default property filters
 */
export const OTODOM_DEFAULT_FILTERS: OtodomPropertyFilters = {
  transaction: 'SELL',
  estate: ['FLAT'], // Default to apartment only
  priceMin: 100000,
  priceMax: 2000000,
  areaMin: 20,
  areaMax: 150,
  ownerType: 'ALL',
  market: 'ALL',
};

/**
 * Request to fetch properties
 */
export interface OtodomPropertyRequest {
  bounds: Bounds;
  filters: OtodomPropertyFilters;
}

/**
 * Response from properties API
 */
export interface OtodomPropertyResponse {
  properties: OtodomProperty[];
  clusters: OtodomPropertyCluster[];
  totalCount: number;
  cached: boolean;
  fetchedAt: string;
}

/**
 * Property cluster (when zoomed out)
 */
export interface OtodomPropertyCluster {
  lat: number;
  lng: number;
  count: number;
  radiusInMeters?: number;
  shape?: string; // GeoJSON polygon string defining the cluster boundary
  estateType?: string; // The estate type this cluster represents (FLAT, HOUSE, etc.)
}

/**
 * Response from cluster properties API
 */
export interface OtodomClusterPropertiesResponse {
  properties: OtodomProperty[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

// ============================================================================
// Price Analysis Types (Otodom-specific enrichment)
// ============================================================================

/**
 * Location quality tier based on heatmap score (20% windows)
 */
export type LocationQualityTier = '0-20' | '20-40' | '40-60' | '60-80' | '80-100';

/**
 * Price category based on comparison with similar properties
 */
export type PriceCategory = 'great_deal' | 'good_deal' | 'fair' | 'above_avg' | 'overpriced' | 'no_data';

/**
 * Price analysis result for a property
 */
export interface OtodomPropertyPriceAnalysis {
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
  /** Percentage difference from median (e.g., -15 means 15% below median) */
  percentFromMedian: number;
  /** Location quality tier based on heatmap */
  locationQualityTier: LocationQualityTier;
  /** Human-readable comparison group description */
  comparisonGroup: string;
}

/**
 * Property with price analysis data
 */
export interface OtodomEnrichedProperty extends OtodomProperty {
  priceAnalysis?: OtodomPropertyPriceAnalysis;
}

/**
 * Type guard to check if a property is enriched with price analysis
 */
export function isEnrichedProperty(
  property: OtodomProperty | OtodomEnrichedProperty
): property is OtodomEnrichedProperty {
  return 'priceAnalysis' in property;
}

/**
 * Price value filter options
 */
export type PriceValueFilter = 'all' | 'great_deal' | 'good_deal' | 'fair' | 'above_avg' | 'overpriced';

/**
 * Price value range for filtering (0-100 positions)
 */
export type PriceValueRange = [number, number];

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Client configuration options
 */
export interface OtodomClientConfig {
  /** Base URL for the API (default: https://www.otodom.pl/api/query) */
  baseUrl?: string;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  /** Cache TTL in milliseconds (default: 3 minutes) */
  cacheTtlMs?: number;
  /** Maximum cache entries (default: 50) */
  maxCacheEntries?: number;
}

// ============================================================================
// Legacy Type Aliases (for backward compatibility)
// ============================================================================

/** @deprecated Use OtodomTransactionType instead */
export type TransactionType = OtodomTransactionType;

/** @deprecated Use OtodomEstateType instead */
export type EstateType = OtodomEstateType;

/** @deprecated Use OtodomOwnerType instead */
export type OwnerType = OtodomOwnerType;

/** @deprecated Use OtodomMarketType instead */
export type MarketType = OtodomMarketType;

/** @deprecated Use OtodomRoomCount instead */
export type RoomCount = OtodomRoomCount;

/** @deprecated Use OtodomFloorLevel instead */
export type FloorLevel = OtodomFloorLevel;

/** @deprecated Use OtodomFlatBuildingType instead */
export type FlatBuildingType = OtodomFlatBuildingType;

/** @deprecated Use OtodomHouseBuildingType instead */
export type HouseBuildingType = OtodomHouseBuildingType;

/** @deprecated Use OtodomBuildingMaterial instead */
export type BuildingMaterial = OtodomBuildingMaterial;

/** @deprecated Use OtodomPropertyExtra instead */
export type PropertyExtra = OtodomPropertyExtra;

/** @deprecated Use OtodomPrice instead */
export type Price = OtodomPrice;

/** @deprecated Use OtodomPropertyImage instead */
export type PropertyImage = OtodomPropertyImage;

/** @deprecated Use OtodomPropertyFilters instead */
export type PropertyFilters = OtodomPropertyFilters;

/** @deprecated Use OTODOM_DEFAULT_FILTERS instead */
export const DEFAULT_PROPERTY_FILTERS = OTODOM_DEFAULT_FILTERS;

/** @deprecated Use OtodomPropertyRequest instead */
export type PropertyRequest = OtodomPropertyRequest;

/** @deprecated Use OtodomPropertyResponse instead */
export type PropertyResponse = OtodomPropertyResponse;

/** @deprecated Use OtodomPropertyCluster instead */
export type PropertyCluster = OtodomPropertyCluster;

/** @deprecated Use OtodomClusterPropertiesResponse instead */
export type ClusterPropertiesResponse = OtodomClusterPropertiesResponse;

/** @deprecated Use OtodomPropertyPriceAnalysis instead */
export type PropertyPriceAnalysis = OtodomPropertyPriceAnalysis;

/** @deprecated Use OtodomEnrichedProperty instead */
export type EnrichedProperty = OtodomEnrichedProperty;
