/**
 * Otodom Module
 *
 * Self-contained module for Otodom.pl real estate API integration.
 */

// Types - Otodom-specific only
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
  OtodomPropertyResponse,
  OtodomPropertyCluster,
  OtodomPropertyPriceAnalysis,
  OtodomEnrichedProperty,
} from './types';

export {
  OTODOM_DEFAULT_FILTERS,
} from './types';

// Client
export {
  fetchOtodomProperties,
  fetchClusterProperties,
} from './client';

// Adapter
export {
  OtodomAdapter,
  // Conversion utilities (used by cluster API route)
  fromOtodomRoomCount,
  toUnifiedProperty,
} from './adapter';
