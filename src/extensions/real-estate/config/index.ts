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
  PRICE_CATEGORY_COLORS,
  PRICE_BADGE_COLORS,
  PRICE_BADGE_LABELS_EN,
} from './price-colors';

// UI constants
export {
  PROPERTY_ICON_SIZE,
  PROPERTY_ICON_HEIGHT,
  PROPERTY_ICON_ANCHOR_X,
  PROPERTY_ICON_ANCHOR_Y,
  PROPERTY_POPUP_ANCHOR_Y,
  CLUSTER_ICON_SIZE,
  CLUSTER_ICON_WITH_LABEL_HEIGHT,
  PROPERTY_POPUP_MAX_WIDTH,
  CLUSTER_POPUP_MAX_WIDTH,
  DETAILED_THRESHOLD_MIN,
  DETAILED_THRESHOLD_MAX,
  DETAILED_THRESHOLD_STEP,
  CLICK_FETCH_LIMIT,
  BACKGROUND_FETCH_LIMIT,
  POPUP_EVENT_LISTENER_DELAY,
} from './constants';
