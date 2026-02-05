/**
 * Property Types (Backward Compatibility)
 *
 * This file re-exports types from the new location for backward compatibility.
 * New code should import directly from '../lib/otodom/types' or '../lib'.
 *
 * @deprecated Import from '../lib/otodom/types' or '../lib' instead
 */

// Re-export all Otodom types for backward compatibility
export type {
  OtodomTransactionType as TransactionType,
  OtodomEstateType as EstateType,
  OtodomOwnerType as OwnerType,
  OtodomMarketType as MarketType,
  OtodomRoomCount as RoomCount,
  OtodomFloorLevel as FloorLevel,
  OtodomFlatBuildingType as FlatBuildingType,
  OtodomHouseBuildingType as HouseBuildingType,
  OtodomBuildingMaterial as BuildingMaterial,
  OtodomPropertyExtra as PropertyExtra,
  OtodomPrice as Price,
  OtodomPropertyImage as PropertyImage,
  OtodomProperty,
  OtodomPropertyFilters as PropertyFilters,
  OtodomPropertyRequest as PropertyRequest,
  OtodomPropertyResponse as PropertyResponse,
  OtodomPropertyCluster as PropertyCluster,
  OtodomClusterPropertiesResponse as ClusterPropertiesResponse,
  OtodomPropertyPriceAnalysis as PropertyPriceAnalysis,
  OtodomEnrichedProperty as EnrichedProperty,
  LocationQualityTier,
  PriceCategory,
  PriceValueFilter,
  PriceValueRange,
} from '../lib/otodom/types';

export {
  OTODOM_DEFAULT_FILTERS as DEFAULT_PROPERTY_FILTERS,
  isEnrichedProperty,
} from '../lib/otodom/types';

// Re-export ClusterPriceDisplay from core types for backward compatibility
export type { ClusterPriceDisplay } from '@/types/heatmap';
