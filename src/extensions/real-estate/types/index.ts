/**
 * Real estate extension types
 * Re-exports all property-related types
 */

export type {
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
  OtodomProperty,
  PropertyFilters,
  PropertyRequest,
  PropertyResponse,
  PropertyCluster,
  ClusterPropertiesResponse,
  LocationQualityTier,
  PriceCategory,
  PropertyPriceAnalysis,
  EnrichedProperty,
  PriceValueFilter,
  PriceValueRange,
  ClusterPriceDisplay,
} from './property';

export { DEFAULT_PROPERTY_FILTERS, isEnrichedProperty } from './property';
