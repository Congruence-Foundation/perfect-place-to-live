/**
 * Real estate extension configuration
 * Re-exports all config options
 */

export type { PropertyDataSource } from './filters';

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
} from './filters';

export type {
  FilterOption,
  TranslatableFilterOption,
} from './filters';

// Price category colors and labels
export {
  DEFAULT_FALLBACK_COLOR,
  PRICE_CATEGORY_THEME,
  PRICE_CATEGORY_COLORS,
  PRICE_BADGE_COLORS,
  PRICE_BADGE_LABEL_KEYS,
  PRICE_BADGE_LABELS_EN,
  getPriceCategoryColor,
  getPriceCategoryBgColor,
} from './price-colors';
