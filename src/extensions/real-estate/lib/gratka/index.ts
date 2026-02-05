/**
 * Gratka Module
 *
 * Self-contained module for Gratka.pl real estate API integration.
 */

// Types
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
} from './types';

// Client
export {
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
  clearGratkaCache,
  getGratkaCacheStats,
} from './client';

// Adapter
export {
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
  // Filter conversion utilities
  toGratkaBuildingMaterials,
  toGratkaAttributes,
  toGratkaDateFrom,
  parseFloorFromFormatted,
} from './adapter';
