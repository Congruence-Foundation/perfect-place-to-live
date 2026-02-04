import type { Bounds } from '@/types/poi';

/**
 * Transaction type for property listings
 */
export type TransactionType = 'SELL' | 'RENT';

/**
 * Property/estate type
 */
export type EstateType = 'FLAT' | 'HOUSE' | 'TERRAIN' | 'COMMERCIAL' | 'ROOM' | 'GARAGE';

/**
 * Owner type filter
 */
export type OwnerType = 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY';

/**
 * Market type filter
 */
export type MarketType = 'ALL' | 'PRIMARY' | 'SECONDARY';

/**
 * Room count options (matches Otodom API values)
 */
export type RoomCount = 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' | 'SIX' | 'SEVEN' | 'EIGHT' | 'NINE' | 'TEN' | 'MORE';

/**
 * Floor level options for apartments (FLAT)
 */
export type FloorLevel = 
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
export type FlatBuildingType = 
  | 'BLOCK' 
  | 'TENEMENT' 
  | 'HOUSE' 
  | 'INFILL' 
  | 'RIBBON' 
  | 'APARTMENT';

/**
 * Building type options for houses (HOUSE)
 */
export type HouseBuildingType = 
  | 'DETACHED' 
  | 'SEMI_DETACHED' 
  | 'RIBBON' 
  | 'TENEMENT' 
  | 'RESIDENCE' 
  | 'FARM';

/**
 * Building material options
 */
export type BuildingMaterial = 
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
export type PropertyExtra =
  | 'BALCONY'
  | 'TERRACE'
  | 'GARAGE'
  | 'BASEMENT'
  | 'LIFT'
  | 'SEPARATE_KITCHEN'
  | 'GARDEN'
  | 'TWO_STOREY'
  | 'HAS_PHOTOS';

/**
 * Price information
 */
export interface Price {
  value: number;
  currency: string;
}

/**
 * Property image URLs
 */
export interface PropertyImage {
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
  estate: EstateType;
  transaction: TransactionType;
  totalPrice: Price;
  pricePerMeter?: Price;
  areaInSquareMeters: number;
  roomsNumber: string;
  floor?: number;
  buildYear?: number;
  images: PropertyImage[];
  isPromoted: boolean;
  hidePrice: boolean;
  createdAt: string;
  url: string;
}

/**
 * Filters for property search
 */
export interface PropertyFilters {
  transaction: TransactionType;
  estate: EstateType[];  // Allow multiple selection (FLAT, HOUSE, or both)
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  roomsNumber?: RoomCount[];
  ownerType?: OwnerType;
  market?: MarketType;
  // Common filters
  pricePerMeterMin?: number;
  pricePerMeterMax?: number;
  buildYearMin?: number;
  buildYearMax?: number;
  buildingMaterial?: BuildingMaterial[];
  daysSinceCreated?: '1' | '3' | '7' | '14' | '30' | '90';
  extras?: PropertyExtra[];
  description?: string; // Fragment opisu (description search)
  // FLAT-specific filters
  floors?: FloorLevel[];
  floorsNumberMin?: number;
  floorsNumberMax?: number;
  flatBuildingType?: FlatBuildingType[];
  // HOUSE-specific filters
  terrainAreaMin?: number;
  terrainAreaMax?: number;
  houseBuildingType?: HouseBuildingType[];
  isBungalow?: boolean; // Dom parterowy (single-storey house)
}

/**
 * Default property filters
 */
export const DEFAULT_PROPERTY_FILTERS: PropertyFilters = {
  transaction: 'SELL',
  estate: ['FLAT'],  // Default to apartment only
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
export interface PropertyRequest {
  bounds: Bounds;
  filters: PropertyFilters;
}

/**
 * Response from properties API
 */
export interface PropertyResponse {
  properties: OtodomProperty[];
  clusters: PropertyCluster[];
  totalCount: number;
  cached: boolean;
  fetchedAt: string;
}

/**
 * Property cluster (when zoomed out)
 */
export interface PropertyCluster {
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
export interface ClusterPropertiesResponse {
  properties: OtodomProperty[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

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
export interface EnrichedProperty extends OtodomProperty {
  priceAnalysis?: PropertyPriceAnalysis;
}

/**
 * Type guard to check if a property is enriched with price analysis
 */
export function isEnrichedProperty(property: OtodomProperty | EnrichedProperty): property is EnrichedProperty {
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

// Re-export ClusterPriceDisplay from core types for backward compatibility
export type { ClusterPriceDisplay } from '@/types/heatmap';
