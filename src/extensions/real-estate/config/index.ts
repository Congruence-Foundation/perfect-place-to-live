/**
 * Real estate extension configuration
 * Re-exports all config options
 */

export type { DataSource } from './filters';

export {
  ROOM_OPTIONS,
  FLOOR_OPTIONS,
  FLAT_BUILDING_TYPE_OPTIONS,
  HOUSE_BUILDING_TYPE_OPTIONS,
  BUILDING_MATERIAL_OPTIONS,
  COMMON_BUILDING_MATERIALS,
  EXTRAS_OPTIONS,
  LISTING_AGE_OPTIONS,
  MARKET_OPTIONS,
  OWNER_TYPE_OPTIONS,
  DATA_SOURCE_FILTERS,
} from './filters';

export type {
  FilterOption,
  TranslatableFilterOption,
  FilterCapability,
  DataSourceFilterConfig,
} from './filters';
