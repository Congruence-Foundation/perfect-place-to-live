/**
 * Shared Module
 *
 * Contains unified types and interfaces used by all data source adapters.
 */

// Types
export type {
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
  // Price analysis types
  LocationQualityTier,
  PriceCategory,
  PropertyPriceAnalysis,
  EnrichedUnifiedProperty,
  PriceValueFilter,
  PriceValueRange,
} from './types';

export {
  createUnifiedId,
  parseUnifiedId,
  isEnrichedUnifiedProperty,
} from './types';

// Data Source Interface and Factory
export type {
  IPropertyDataSource,
  DataSourceFeature,
} from './datasource';

export {
  MultiSourceDataSource,
  createDataSource,
  createMultiSource,
  getDataSource,
  registerDataSource,
  getRegisteredSources,
} from './datasource';
