import type { EstateType, PriceCategory } from '../types/property';
import { PRICE_CATEGORY_COLORS } from '../config/price-colors';
import { formatCompactPrice } from '@/lib/format';
import { DEFAULT_FALLBACK_COLOR } from '@/constants/colors';

/**
 * Property marker colors by estate type
 */
const PROPERTY_MARKER_COLORS: Record<EstateType, string> = {
  FLAT: '#3b82f6',      // Blue
  HOUSE: '#16a34a',     // Green
  TERRAIN: '#f59e0b',   // Amber
  COMMERCIAL: '#8b5cf6', // Purple
  ROOM: '#ec4899',      // Pink
  GARAGE: DEFAULT_FALLBACK_COLOR,
};

/**
 * SVG icon paths for each estate type
 */
const PROPERTY_MARKER_ICONS: Record<EstateType, string> = {
  // Apartment building icon
  FLAT: `<rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="9" y1="6" x2="9" y2="6.01"></line><line x1="15" y1="6" x2="15" y2="6.01"></line><line x1="9" y1="10" x2="9" y2="10.01"></line><line x1="15" y1="10" x2="15" y2="10.01"></line><line x1="9" y1="14" x2="9" y2="14.01"></line><line x1="15" y1="14" x2="15" y2="14.01"></line><line x1="9" y1="18" x2="15" y2="18"></line>`,
  // House icon
  HOUSE: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>`,
  // Terrain/land icon
  TERRAIN: `<path d="M2 22L12 12l10 10"></path><path d="M2 22h20"></path>`,
  // Commercial building icon
  COMMERCIAL: `<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M9 21V9"></path>`,
  // Room icon
  ROOM: `<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path>`,
  // Garage icon
  GARAGE: `<path d="M3 21V8l9-5 9 5v13"></path><rect x="6" y="13" width="12" height="8"></rect>`,
};

/**
 * Generate HTML for a property marker icon with optional price category indicator and price label
 * Can be used with Leaflet's L.divIcon
 */
export function generatePropertyMarkerHtml(
  estateType: EstateType, 
  size: number = 28,
  priceCategory?: PriceCategory,
  price?: number
): string {
  const color = PROPERTY_MARKER_COLORS[estateType] || PROPERTY_MARKER_COLORS.FLAT;
  const iconSvg = PROPERTY_MARKER_ICONS[estateType] || PROPERTY_MARKER_ICONS.FLAT;
  const iconSize = Math.round(size / 2);
  
  // Determine border color and glow based on price category
  const hasPriceData = priceCategory && priceCategory !== 'no_data' && priceCategory !== 'fair';
  const borderColor = hasPriceData ? PRICE_CATEGORY_COLORS[priceCategory] : 'white';
  const glowColor = hasPriceData ? PRICE_CATEGORY_COLORS[priceCategory] : 'transparent';
  const borderWidth = hasPriceData ? 3 : 2;
  const glowSize = hasPriceData ? '0 0 8px 2px' : '0 2px 6px';
  const glowOpacity = hasPriceData ? '0.6' : '0.3';
  
  // Price label (subtle, below the marker)
  const priceLabel = price ? `
    <div style="
      position: absolute;
      top: ${size + 2}px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255,255,255,0.9);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 500;
      color: #374151;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
      pointer-events: none;
    ">${formatCompactPrice(price)}</div>
  ` : '';
  
  return `
    <div style="position: relative;">
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: ${borderWidth}px solid ${borderColor};
        border-radius: 50%;
        box-shadow: ${glowSize} rgba(${hexToRgb(glowColor) || '0,0,0'}, ${glowOpacity});
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${iconSvg}
        </svg>
      </div>
      ${priceLabel}
    </div>
  `;
}

/**
 * Convert hex color to RGB string
 */
function hexToRgb(hex: string): string | null {
  if (hex === 'transparent' || hex === 'white') return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result 
    ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
    : null;
}

/**
 * Get the CSS class name for a property marker
 */
export function getPropertyMarkerClassName(estateType: EstateType, priceCategory?: PriceCategory): string {
  const base = `property-marker property-marker-${estateType.toLowerCase()}`;
  if (priceCategory && priceCategory !== 'no_data') {
    return `${base} property-marker-${priceCategory.replace('_', '-')}`;
  }
  return base;
}
