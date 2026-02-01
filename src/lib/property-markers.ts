import { EstateType } from '@/types/property';

/**
 * Property marker colors by estate type
 */
const PROPERTY_MARKER_COLORS: Record<EstateType, string> = {
  FLAT: '#3b82f6',      // Blue
  HOUSE: '#16a34a',     // Green
  TERRAIN: '#f59e0b',   // Amber
  COMMERCIAL: '#8b5cf6', // Purple
  ROOM: '#ec4899',      // Pink
  GARAGE: '#6b7280',    // Gray
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
 * Generate HTML for a property marker icon
 * Can be used with Leaflet's L.divIcon
 */
export function generatePropertyMarkerHtml(estateType: EstateType, size: number = 28): string {
  const color = PROPERTY_MARKER_COLORS[estateType] || PROPERTY_MARKER_COLORS.FLAT;
  const iconSvg = PROPERTY_MARKER_ICONS[estateType] || PROPERTY_MARKER_ICONS.FLAT;
  const iconSize = Math.round(size / 2);
  
  return `
    <div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${iconSvg}
      </svg>
    </div>
  `;
}

/**
 * Get the CSS class name for a property marker
 */
export function getPropertyMarkerClassName(estateType: EstateType): string {
  return `property-marker property-marker-${estateType.toLowerCase()}`;
}
