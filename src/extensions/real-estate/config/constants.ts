/**
 * Real Estate Extension Constants
 * 
 * Centralized configuration for UI dimensions, limits, and thresholds
 */

import type { PropertyDataSource } from './filters';

// =============================================================================
// Property Marker Dimensions
// =============================================================================

/** Property marker icon size in pixels */
export const PROPERTY_ICON_SIZE = 28;

/** Property marker icon height (includes pin tail) */
export const PROPERTY_ICON_HEIGHT = 44;

/** Property marker icon anchor X (center of icon) */
export const PROPERTY_ICON_ANCHOR_X = PROPERTY_ICON_SIZE / 2; // 14

/** Property marker icon anchor Y (bottom of pin) */
export const PROPERTY_ICON_ANCHOR_Y = PROPERTY_ICON_SIZE; // 28

/** Property marker popup anchor Y offset */
export const PROPERTY_POPUP_ANCHOR_Y = -PROPERTY_ICON_SIZE; // -28

// =============================================================================
// Cluster Marker Dimensions
// =============================================================================

/** Cluster marker icon size in pixels */
export const CLUSTER_ICON_SIZE = 36;

/** Cluster marker icon height when showing price label */
export const CLUSTER_ICON_WITH_LABEL_HEIGHT = 54;

// =============================================================================
// Popup Dimensions
// =============================================================================

/** Maximum width for property popups */
export const PROPERTY_POPUP_MAX_WIDTH = 280;

/** Maximum width for cluster popups */
export const CLUSTER_POPUP_MAX_WIDTH = 300;

// =============================================================================
// Detailed Mode Threshold Slider
// =============================================================================

/** Minimum value for detailed mode threshold slider */
export const DETAILED_THRESHOLD_MIN = 20;

/** Maximum value for detailed mode threshold slider */
export const DETAILED_THRESHOLD_MAX = 500;

/** Step value for detailed mode threshold slider */
export const DETAILED_THRESHOLD_STEP = 20;

// =============================================================================
// Detailed Mode Batch Fetching
// =============================================================================

/** Maximum properties to fetch per cluster in detailed mode */
export const DETAILED_MODE_CLUSTER_FETCH_LIMIT = 50;

/** Batch size for concurrent cluster fetches */
export const CLUSTER_FETCH_BATCH_SIZE = 5;

/** Delay between batch fetches in milliseconds */
export const CLUSTER_FETCH_BATCH_DELAY_MS = 100;

/** Number of API batches before flushing to cache (5 batches = 25 clusters) */
export const CACHE_FLUSH_INTERVAL = 5;

/** Threshold for significant cluster count change (triggers cache clear) */
export const CLUSTER_CHANGE_THRESHOLD = 50;

// =============================================================================
// Fetch Limits
// =============================================================================

/** Number of properties to fetch on cluster click */
export const CLICK_FETCH_LIMIT = 500;

/** Number of properties to fetch in background for detailed mode */
export const BACKGROUND_FETCH_LIMIT = 100;

// =============================================================================
// Timing Constants
// =============================================================================

/** Delay before attaching popup event listeners (ms) */
export const POPUP_EVENT_LISTENER_DELAY = 50;

// =============================================================================
// Otodom API Configuration
// =============================================================================

/** Otodom GraphQL API URL */
export const OTODOM_API_URL = 'https://www.otodom.pl/api/query';

/** Otodom SearchMapPins query hash */
export const OTODOM_SEARCH_MAP_PINS_HASH = '51e8703aff1dd9b3ad3bae1ab6c543254e19b3576da1ee23eba0dca2b9341e27';

/** Otodom SearchMapQuery hash */
export const OTODOM_SEARCH_MAP_QUERY_HASH = 'cef9f63d93a284e3a896b78d67ff42139214c4317f6dfa73231cc1b136a2313d';

/** Cluster search radius for Otodom API requests (meters) */
export const OTODOM_CLUSTER_RADIUS_METERS = 500;

/** Default minimum area filter for Otodom API (m²) */
export const OTODOM_DEFAULT_AREA_MIN = 1;

/** Default maximum area filter for Otodom API (m²) */
export const OTODOM_DEFAULT_AREA_MAX = 500;

/** Default pagination limit for cluster property fetches */
export const OTODOM_DEFAULT_CLUSTER_PAGE_LIMIT = 36;

// =============================================================================
// Gratka API Configuration
// =============================================================================

/** Gratka GraphQL API URL */
export const GRATKA_API_URL = 'https://gratka.pl/api-gratka';

/** Gratka base URL for property links */
export const GRATKA_BASE_URL = 'https://gratka.pl';

/** Gratka CDN URL for property images */
export const GRATKA_CDN_URL = 'https://thumbs.cdngr.pl';

/** Default page size for Gratka API requests */
export const GRATKA_DEFAULT_PAGE_SIZE = 35;

/** Default maximum markers for Gratka map search */
export const GRATKA_DEFAULT_MAX_MARKERS = 200;

/** Cluster search radius for Gratka API requests (meters) */
export const GRATKA_CLUSTER_RADIUS_METERS = 500;

// =============================================================================
// Price Analysis Configuration
// =============================================================================

/** Minimum number of properties in a group for valid statistical comparison */
export const PRICE_ANALYSIS_MIN_GROUP_SIZE = 5;

/** Minimum extended search radius for price analysis (meters) */
export const PRICE_ANALYSIS_MIN_SEARCH_RADIUS = 2000;

/** Grid cell size multiplier for extended search radius */
export const PRICE_ANALYSIS_GRID_MULTIPLIER = 10;

/** Price score thresholds for categorization */
export const PRICE_SCORE_THRESHOLDS = {
  /** Below this = great_deal */
  GREAT_DEAL: -1.0,
  /** Below this = good_deal */
  GOOD_DEAL: -0.5,
  /** At or below this = fair */
  FAIR: 0.5,
  /** At or below this = above_avg, above = overpriced */
  ABOVE_AVG: 1.0,
} as const;

// =============================================================================
// Spatial Index Configuration
// =============================================================================

/** Default cell size for spatial index (meters) */
export const SPATIAL_INDEX_CELL_SIZE_METERS = 100;

/** Threshold for using linear search vs spatial index */
export const SPATIAL_INDEX_LINEAR_THRESHOLD = 100;

/** Threshold for detecting heatmap K value variation (values closer than this are considered identical) */
export const HEATMAP_VARIATION_THRESHOLD = 0.001;

// =============================================================================
// Filter Default Values (for cache key generation)
// =============================================================================

/** Default maximum price when not specified (effectively unlimited) */
export const FILTER_DEFAULT_PRICE_MAX = 999999999;

/** Default maximum area when not specified (m²) */
export const FILTER_DEFAULT_AREA_MAX = 999;

/** Default maximum terrain area when not specified (m²) */
export const FILTER_DEFAULT_TERRAIN_AREA_MAX = 999999;

// =============================================================================
// Default UI Values
// =============================================================================

/** Default score range for filtering properties */
export const DEFAULT_SCORE_RANGE: [number, number] = [50, 100];

/** Default price value range for filtering properties */
export const DEFAULT_PRICE_VALUE_RANGE: [number, number] = [0, 100];

/** Default data sources for property fetching */
export const DEFAULT_DATA_SOURCES: PropertyDataSource[] = ['otodom', 'gratka'];

/** Data source metadata for UI components */
export const DATA_SOURCE_OPTIONS: { id: PropertyDataSource; label: string }[] = [
  { id: 'otodom', label: 'Otodom' },
  { id: 'gratka', label: 'Gratka' },
];

// =============================================================================
// Transaction Type Price Defaults
// =============================================================================

/** Default price range for rental properties */
export const DEFAULT_RENT_PRICE = { min: 1000, max: 10000 };

/** Default price range for sale properties */
export const DEFAULT_SELL_PRICE = { min: 100000, max: 2000000 };

/** Get default price range for a transaction type */
export function getDefaultPriceRange(transaction: 'RENT' | 'SELL') {
  return transaction === 'RENT' ? DEFAULT_RENT_PRICE : DEFAULT_SELL_PRICE;
}
