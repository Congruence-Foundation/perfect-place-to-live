/**
 * Real Estate Library
 *
 * Main entry point for the real estate data layer.
 * Re-exports from source-specific modules and shared utilities.
 */

// ============================================================================
// Otodom Module
// ============================================================================
export {
  // Client (used by API routes)
  fetchClusterProperties,
  // Conversion utility (used by cluster API route)
  fromOtodomRoomCount,
  // Types
  OTODOM_DEFAULT_FILTERS,
} from './otodom';

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
} from './otodom';

// ============================================================================
// Gratka Module
// ============================================================================
export {
  // Client (used by API routes)
  fetchGratkaClusterProperties,
} from './gratka';

export type {
  GratkaTransactionType,
  GratkaPropertyType,
  GratkaOwnerType,
  GratkaMarketType,
  GratkaSortKey,
  GratkaSortOrder,
  GratkaCoordinates,
  GratkaMapBounds,
  GratkaLocationIdentifier,
  GratkaPropertyAttributes,
  GratkaLocationInput,
  GratkaSearchParameters,
  GratkaSearchOrder,
  GratkaListingParametersInput,
  GratkaMarkerConfiguration,
  GratkaLocationSuggestionsInput,
  GratkaImage,
  GratkaCompany,
  GratkaPerson,
  GratkaContact,
  GratkaDevelopment,
  GratkaPrice,
  GratkaPropertyLocation,
  GratkaPropertyNode,
  GratkaMapMarker,
  GratkaLocationSuggestion,
  GratkaEncodeListingParametersResponse,
  GratkaPropertyClusterDataResponse,
  GratkaGetMarkersResponse,
  GratkaSearchMapResponse,
  GratkaLocationSuggestionsResponse,
  GratkaGraphQLError,
  GratkaGraphQLResponse,
} from './gratka';

// ============================================================================
// Shared Module (Unified Types and Data Source Interface)
// ============================================================================
export {
  // Utilities
  createUnifiedId,
  isEnrichedUnifiedProperty,
  // Data Source Factory (createDataSource is internal, only createMultiSource is public)
  createMultiSource,
} from './shared';

export type {
  // Unified Types
  UnifiedPropertyImage,
  UnifiedProperty,
  UnifiedCluster,
  UnifiedTransactionType,
  UnifiedEstateType,
  UnifiedMarketType,
  UnifiedOwnerType,
  UnifiedSortKey,
  UnifiedContactType,
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedLocationSuggestion,
  // Price Analysis Types
  LocationQualityTier,
  PriceCategory,
  PropertyPriceAnalysis,
  EnrichedUnifiedProperty,
  PriceValueFilter,
  PriceValueRange,
  // Data Source Interface
  IPropertyDataSource,
  DataSourceFeature,
} from './shared';

// ============================================================================
// Price Analysis
// ============================================================================
export {
  enrichPropertiesWithPriceScore,
  enrichPropertiesSimplified,
  filterPropertiesByPriceValue,
  analyzeClusterPrices,
  analyzeClusterPricesFromCache,
  findMinMaxCategories,
  // Note: getPricePerMeter is internal - only used within price-analysis.ts
} from './price-analysis';
export type { ClusterPriceAnalysis, ClusterAnalysisMap } from './price-analysis';

// ============================================================================
// Property Markers
// ============================================================================
export {
  generatePropertyMarkerHtml,
  getPropertyMarkerClassName,
  PROPERTY_MARKER_COLORS,
} from './property-markers';

// ============================================================================
// Score Lookup
// ============================================================================
export { filterPropertiesByScore, filterClustersByScore, findNearestHeatmapPoint, hasHeatmapVariation } from './score-lookup';
