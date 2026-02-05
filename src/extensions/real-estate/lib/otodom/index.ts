/**
 * Otodom Module
 *
 * Self-contained module for Otodom.pl real estate API integration.
 */

// Types
export type {
  OtodomTransactionType,
  OtodomEstateType,
  OtodomOwnerType,
  OtodomMarketType,
  OtodomRoomCount,
  OtodomFloorLevel,
  OtodomFlatBuildingType,
  OtodomHouseBuildingType,
  OtodomBuildingMaterial,
  OtodomPropertyExtra,
  OtodomPrice,
  OtodomPropertyImage,
  OtodomProperty,
  OtodomPropertyFilters,
  OtodomPropertyRequest,
  OtodomPropertyResponse,
  OtodomPropertyCluster,
  OtodomClusterPropertiesResponse,
  OtodomPropertyPriceAnalysis,
  OtodomEnrichedProperty,
  OtodomClientConfig,
  LocationQualityTier,
  PriceCategory,
  PriceValueFilter,
  PriceValueRange,
  // Legacy aliases
  TransactionType,
  EstateType,
  OwnerType,
  MarketType,
  RoomCount,
  FloorLevel,
  FlatBuildingType,
  HouseBuildingType,
  BuildingMaterial,
  PropertyExtra,
  Price,
  PropertyImage,
  PropertyFilters,
  PropertyRequest,
  PropertyResponse,
  PropertyCluster,
  ClusterPropertiesResponse,
  PropertyPriceAnalysis,
  EnrichedProperty,
} from './types';

export {
  OTODOM_DEFAULT_FILTERS,
  DEFAULT_PROPERTY_FILTERS,
  isEnrichedProperty,
} from './types';

// Client
export {
  OtodomClient,
  otodomClient,
  fetchOtodomProperties,
  fetchClusterProperties,
  validateEstateType,
} from './client';

// Adapter
export {
  OtodomAdapter,
  getOtodomAdapter,
  // Conversion utilities
  mapOtodomTransaction,
  mapOtodomEstateType,
  toOtodomOwnerType,
  toOtodomSortKey,
  toOtodomRoomCount,
  fromOtodomRoomCount,
} from './adapter';
