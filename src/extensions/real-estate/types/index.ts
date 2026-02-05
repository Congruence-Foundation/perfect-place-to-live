/**
 * Real estate extension types
 * 
 * Re-exports property-related types for backward compatibility.
 * For new code, prefer importing from '../lib/shared' for unified types.
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
  PropertyResponse,
  PropertyCluster,
  LocationQualityTier,
  PriceCategory,
  PropertyPriceAnalysis,
  EnrichedProperty,
  PriceValueFilter,
  PriceValueRange,
  ClusterPriceDisplay,
} from './property';

export { DEFAULT_PROPERTY_FILTERS } from './property';
