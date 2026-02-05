/**
 * Property Types (Backward Compatibility Layer)
 *
 * This file re-exports types from the unified types location for backward compatibility.
 * It allows existing code to continue importing from '@/extensions/real-estate/types'
 * while the actual type definitions live in '../lib/shared/types' and '../lib/otodom/types'.
 *
 * For new code, prefer importing directly from:
 * - '../lib/shared' for unified types (UnifiedProperty, EnrichedUnifiedProperty, etc.)
 * - '../lib/otodom' for Otodom-specific types
 * - '../lib/gratka' for Gratka-specific types
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
  OtodomPropertyResponse as PropertyResponse,
  OtodomPropertyCluster as PropertyCluster,
  OtodomPropertyPriceAnalysis as PropertyPriceAnalysis,
  OtodomEnrichedProperty as EnrichedProperty,
} from '../lib/otodom/types';

// Re-export shared types for backward compatibility
export type {
  LocationQualityTier,
  PriceCategory,
  PriceValueFilter,
  PriceValueRange,
} from '../lib/shared/types';

export {
  OTODOM_DEFAULT_FILTERS as DEFAULT_PROPERTY_FILTERS,
} from '../lib/otodom/types';

// Re-export ClusterPriceDisplay from core types for backward compatibility
export type { ClusterPriceDisplay } from '@/types/heatmap';
