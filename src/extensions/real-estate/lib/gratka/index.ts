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
  GratkaMapMarker,
  GratkaLocationSuggestion,
  GratkaEncodeListingParametersResponse,
  GratkaPropertyClusterDataResponse,
  GratkaGetMarkersResponse,
  GratkaSearchMapResponse,
  GratkaLocationSuggestionsResponse,
  GratkaGraphQLError,
  GratkaGraphQLResponse,
} from './types';

// Client
export { fetchGratkaClusterProperties } from './client';

// Adapter
export {
  GratkaAdapter,
  toUnifiedProperty as toUnifiedGratkaProperty,
} from './adapter';
