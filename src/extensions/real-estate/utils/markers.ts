import type { PriceCategory, EnrichedProperty, ClusterPriceDisplay } from '@/types/property';
import { PRICE_CATEGORY_COLORS } from '@/lib/price-analysis';
import { formatCompactPrice } from '@/lib/format';

// Cluster icon dimensions
export const CLUSTER_ICON_SIZE = 36;
export const CLUSTER_ICON_WITH_LABEL_HEIGHT = 54;

// Price analysis badge configuration
export const PRICE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  great_deal: { bg: '#f0fdf4', text: '#16a34a' },
  good_deal: { bg: '#f0fdf4', text: '#059669' },
  fair: { bg: '#f8fafc', text: '#64748b' },
  above_avg: { bg: '#fff7ed', text: '#ea580c' },
  overpriced: { bg: '#fef2f2', text: '#dc2626' },
};

export const PRICE_BADGE_LABELS: Record<string, string> = {
  great_deal: 'Great Deal',
  good_deal: 'Good Deal',
  fair: 'Fair Price',
  above_avg: 'Above Avg',
  overpriced: 'Overpriced',
};

/**
 * Generate cluster price label based on display mode
 */
export function generateClusterPriceLabel(
  prices: number[],
  displayMode: ClusterPriceDisplay
): string {
  if (displayMode === 'none' || prices.length === 0) {
    return '';
  }

  const sortedPrices = [...prices].sort((a, b) => a - b);
  const minPrice = sortedPrices[0];
  const maxPrice = sortedPrices[sortedPrices.length - 1];
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

  switch (displayMode) {
    case 'range':
      return `${formatCompactPrice(minPrice)} - ${formatCompactPrice(maxPrice)}`;
    
    case 'median':
      return `~${formatCompactPrice(medianPrice)}`;
    
    case 'median_spread': {
      // Calculate spread as percentage from median
      const spread = Math.round(((maxPrice - minPrice) / medianPrice) * 50); // ±spread%
      return `${formatCompactPrice(medianPrice)} ±${spread}%`;
    }
    
    default:
      return '';
  }
}

/**
 * Get min/max price categories from enriched properties
 */
export function getClusterPriceCategories(
  properties: EnrichedProperty[]
): { minCategory: PriceCategory | null; maxCategory: PriceCategory | null } {
  const withAnalysis = properties.filter(p => p.priceAnalysis && p.priceAnalysis.priceCategory !== 'no_data');
  
  if (withAnalysis.length === 0) {
    return { minCategory: null, maxCategory: null };
  }

  // Sort by price score (lower = better deal)
  const sorted = [...withAnalysis].sort((a, b) => 
    (a.priceAnalysis?.priceScore || 0) - (b.priceAnalysis?.priceScore || 0)
  );

  return {
    minCategory: sorted[0].priceAnalysis?.priceCategory || null,
    maxCategory: sorted[sorted.length - 1].priceAnalysis?.priceCategory || null,
  };
}

/**
 * Create cluster icon HTML with optional price label and glow
 */
export function createClusterIconHtml(
  count: number,
  priceLabel: string,
  minCategory: PriceCategory | null,
  maxCategory: PriceCategory | null
): { html: string; hasLabel: boolean } {
  const leftGlowColor = minCategory ? PRICE_CATEGORY_COLORS[minCategory] : null;
  const rightGlowColor = maxCategory ? PRICE_CATEGORY_COLORS[maxCategory] : null;
  const hasGlow = leftGlowColor || rightGlowColor;
  
  // Build box-shadow for left/right glow
  let boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  if (hasGlow) {
    const shadows = ['0 2px 8px rgba(0,0,0,0.3)'];
    if (leftGlowColor) {
      shadows.push(`-6px 0 12px -2px ${leftGlowColor}`);
    }
    if (rightGlowColor) {
      shadows.push(`6px 0 12px -2px ${rightGlowColor}`);
    }
    boxShadow = shadows.join(', ');
  }
  
  // Build the label below cluster (price only)
  const hasLabel = !!priceLabel;
  let bottomLabelHtml = '';
  if (hasLabel) {
    bottomLabelHtml = `
      <div style="
        position: absolute;
        top: 38px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255,255,255,0.95);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 500;
        color: #374151;
        white-space: nowrap;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        pointer-events: none;
      ">${priceLabel}</div>
    `;
  }
  
  const html = `
    <div style="position: relative;">
      <div style="
        min-width: 36px;
        height: 36px;
        background: #3b82f6;
        border: 3px solid white;
        border-radius: 18px;
        box-shadow: ${boxShadow};
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 8px;
        cursor: pointer;
      ">
        <span style="color: white; font-weight: 700; font-size: 12px;">${count}</span>
      </div>
      ${bottomLabelHtml}
    </div>
  `;
  
  return { html, hasLabel };
}

/**
 * Create a Leaflet divIcon for a cluster marker
 */
export function createClusterDivIcon(
  L: typeof import('leaflet'),
  count: number,
  priceLabel: string,
  minCategory: PriceCategory | null,
  maxCategory: PriceCategory | null
): L.DivIcon {
  const { html, hasLabel } = createClusterIconHtml(count, priceLabel, minCategory, maxCategory);
  return L.divIcon({
    className: 'property-cluster-marker',
    html,
    iconSize: [CLUSTER_ICON_SIZE, hasLabel ? CLUSTER_ICON_WITH_LABEL_HEIGHT : CLUSTER_ICON_SIZE],
    iconAnchor: [CLUSTER_ICON_SIZE / 2, CLUSTER_ICON_SIZE / 2],
  });
}

/**
 * Generate price analysis badge HTML for property popups
 */
export function generatePriceAnalysisBadgeHtml(priceAnalysis: EnrichedProperty['priceAnalysis']): string {
  if (!priceAnalysis || priceAnalysis.priceCategory === 'no_data') {
    return '';
  }
  
  const colors = PRICE_BADGE_COLORS[priceAnalysis.priceCategory] || PRICE_BADGE_COLORS.fair;
  const label = PRICE_BADGE_LABELS[priceAnalysis.priceCategory] || 'Fair';
  const percentSign = priceAnalysis.percentFromMedian >= 0 ? '+' : '';
  
  return `
    <div style="margin-bottom: 6px; padding: 6px 8px; background: ${colors.bg}; border-radius: 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 10px; color: ${colors.text};">${label} · vs ${priceAnalysis.groupSize} similar</span>
        <span style="font-weight: 600; color: ${colors.text}; font-size: 11px;">${percentSign}${priceAnalysis.percentFromMedian}%</span>
      </div>
    </div>
  `;
}

/**
 * Extract valid prices from properties (excluding hidden/zero prices)
 */
export function getValidPrices(properties: Array<{ hidePrice: boolean; totalPrice: { value: number } }>): number[] {
  return properties
    .filter(p => !p.hidePrice && p.totalPrice.value > 0)
    .map(p => p.totalPrice.value);
}
