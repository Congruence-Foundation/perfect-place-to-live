/**
 * Otodom.pl API Type Definitions
 *
 * Types specific to the Otodom real estate API.
 * These are used internally by the Otodom client and adapter.
 */

import type { PropertyPriceAnalysis } from '../shared/types';

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

// ============================================================================
// Price Analysis Types (Otodom-specific enrichment)
// ============================================================================

/**
 * Price analysis result for a property.
 * Alias for the shared PropertyPriceAnalysis type for backward compatibility.
 */
export type OtodomPropertyPriceAnalysis = PropertyPriceAnalysis;

/**
 * Property with price analysis data
 */
export interface OtodomEnrichedProperty extends OtodomProperty {
  priceAnalysis?: OtodomPropertyPriceAnalysis;
}
