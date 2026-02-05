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
  // Client
  OtodomClient,
  otodomClient,
  fetchOtodomProperties,
  fetchClusterProperties,
  validateEstateType,
  // Adapter
  OtodomAdapter,
  getOtodomAdapter,
  // Conversion utilities
  mapOtodomTransaction,
  mapOtodomEstateType,
  toOtodomOwnerType,
  toOtodomSortKey,
  toOtodomRoomCount,
  fromOtodomRoomCount,
  // Types
  OTODOM_DEFAULT_FILTERS,
  DEFAULT_PROPERTY_FILTERS,
  isEnrichedProperty,
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
} from './otodom';

// ============================================================================
// Gratka Module
// ============================================================================
export {
  // Client
  GratkaClient,
  gratkaClient,
  fetchGratkaProperties,
  fetchGratkaMapMarkers,
  fetchGratkaClusterProperties,
  fetchGratkaPropertiesByIds,
  searchGratkaLocations,
  generateGratkaSessionId,
  formatGratkaPrice,
  formatGratkaArea,
  buildGratkaSearchParams,
  // Adapter
  GratkaAdapter,
  getGratkaAdapter,
  // Conversion utilities
  mapGratkaTransaction,
  toGratkaTransaction,
  mapGratkaPropertyType,
  toGratkaPropertyType,
  toGratkaOwnerType,
  toGratkaSortKey,
  mapGratkaContactType,
} from './gratka';

export type {
  GratkaTransactionType,
  GratkaPropertyType,
  GratkaOwnerType,
  GratkaMarketType,
  GratkaSortKey,
  GratkaSortOrder,
  GratkaListingMode,
  GratkaContactType,
  GratkaLocationType,
  GratkaBuildingMaterial,
  GratkaBuildingType,
  GratkaHouseType,
  GratkaCoordinates,
  GratkaMapBounds,
  GratkaLocationIdentifier,
  GratkaPropertyAttributes,
  GratkaLocationInput,
  GratkaSearchParameters,
  GratkaSearchOrder,
  GratkaExtraParameter,
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
  GratkaClusterPropertyNode,
  GratkaMapMarker,
  GratkaLocationInfo,
  GratkaLocationSuggestion,
  GratkaPageInfo,
  GratkaBlogPost,
  GratkaBreadcrumbNode,
  GratkaBreadcrumbs,
  GratkaHeaderTitle,
  GratkaEncodeListingParametersResponse,
  GratkaDecodeListingUrlResponse,
  GratkaSearchResult,
  GratkaPropertyListingDataResponse,
  GratkaPropertyClusterDataResponse,
  GratkaGetMarkersResponse,
  GratkaTopPromotedResponse,
  GratkaSearchMapResponse,
  GratkaLocationSuggestionsResponse,
  GratkaAddPropertyViewResponse,
  GratkaGraphQLError,
  GratkaGraphQLResponse,
  GratkaClientConfig,
} from './gratka';

// ============================================================================
// Shared Module (Unified Types and Data Source Interface)
// ============================================================================
export {
  // Utilities
  createUnifiedId,
  parseUnifiedId,
  isEnrichedUnifiedProperty,
  // Data Source Factory
  MultiSourceDataSource,
  createDataSource,
  createMultiSource,
  getDataSource,
  registerDataSource,
  getRegisteredSources,
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
  // Price Analysis Types (unified)
  LocationQualityTier as UnifiedLocationQualityTier,
  PriceCategory as UnifiedPriceCategory,
  PropertyPriceAnalysis as UnifiedPropertyPriceAnalysis,
  EnrichedUnifiedProperty,
  PriceValueFilter as UnifiedPriceValueFilter,
  PriceValueRange as UnifiedPriceValueRange,
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
  getPricePerMeter,
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
export { filterPropertiesByScore, filterClustersByScore, findNearestHeatmapPoint } from './score-lookup';
