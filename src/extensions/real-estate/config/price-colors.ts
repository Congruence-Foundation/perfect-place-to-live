/**
 * Price Category Color Configuration
 * 
 * Single source of truth for all price category colors used in:
 * - Marker icons
 * - Cluster glow effects
 * - Price badges
 * - UI components
 */

import type { PriceCategory } from '../types';

/**
 * Default fallback color for properties without price data
 */
export const DEFAULT_FALLBACK_COLOR = '#9ca3af'; // Gray-400

/**
 * Price category theme configuration
 * Each category has a primary color (for icons/glow) and a background color (for badges)
 */
export const PRICE_CATEGORY_THEME: Record<PriceCategory, { primary: string; bg: string }> = {
  great_deal: { primary: '#16a34a', bg: '#f0fdf4' },  // Green-600 / Green-50
  good_deal: { primary: '#22c55e', bg: '#f0fdf4' },   // Green-500 / Green-50
  fair: { primary: '#3b82f6', bg: '#eff6ff' },        // Blue-500 / Blue-50
  above_avg: { primary: '#f97316', bg: '#fff7ed' },   // Orange-500 / Orange-50
  overpriced: { primary: '#ef4444', bg: '#fef2f2' },  // Red-500 / Red-50
  no_data: { primary: DEFAULT_FALLBACK_COLOR, bg: '#f3f4f6' }, // Gray-400 / Gray-100
};

/**
 * Get the primary color for a price category (for markers, glow effects)
 */
export function getPriceCategoryColor(category: PriceCategory): string {
  return PRICE_CATEGORY_THEME[category].primary;
}

/**
 * Get the background color for a price category (for badges)
 */
export function getPriceCategoryBgColor(category: PriceCategory): string {
  return PRICE_CATEGORY_THEME[category].bg;
}

/**
 * Legacy export for backward compatibility
 * Maps price category to primary color
 */
export const PRICE_CATEGORY_COLORS: Record<PriceCategory, string> = Object.fromEntries(
  Object.entries(PRICE_CATEGORY_THEME).map(([key, value]) => [key, value.primary])
) as Record<PriceCategory, string>;

/**
 * Price badge colors for UI components
 * Uses primary color for text and bg color for background
 */
export const PRICE_BADGE_COLORS: Record<Exclude<PriceCategory, 'no_data'>, { bg: string; text: string }> = {
  great_deal: { bg: PRICE_CATEGORY_THEME.great_deal.bg, text: PRICE_CATEGORY_THEME.great_deal.primary },
  good_deal: { bg: PRICE_CATEGORY_THEME.good_deal.bg, text: PRICE_CATEGORY_THEME.good_deal.primary },
  fair: { bg: PRICE_CATEGORY_THEME.fair.bg, text: PRICE_CATEGORY_THEME.fair.primary },
  above_avg: { bg: PRICE_CATEGORY_THEME.above_avg.bg, text: PRICE_CATEGORY_THEME.above_avg.primary },
  overpriced: { bg: PRICE_CATEGORY_THEME.overpriced.bg, text: PRICE_CATEGORY_THEME.overpriced.primary },
};

/**
 * Price badge labels - translation keys for i18n
 * Use these keys with useTranslations('realEstate') to get localized labels
 */
export const PRICE_BADGE_LABEL_KEYS: Record<Exclude<PriceCategory, 'no_data'>, string> = {
  great_deal: 'priceCategory.greatDeal',
  good_deal: 'priceCategory.goodDeal',
  fair: 'priceCategory.fair',
  above_avg: 'priceCategory.aboveAvg',
  overpriced: 'priceCategory.overpriced',
};

/**
 * Fallback English labels for non-i18n contexts (e.g., server-side rendering)
 */
export const PRICE_BADGE_LABELS_EN: Record<Exclude<PriceCategory, 'no_data'>, string> = {
  great_deal: 'Great Deal',
  good_deal: 'Good Deal',
  fair: 'Fair Price',
  above_avg: 'Above Avg',
  overpriced: 'Overpriced',
};
