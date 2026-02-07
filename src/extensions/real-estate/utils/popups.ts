import type { 
  UnifiedProperty, 
  EnrichedUnifiedProperty,
} from '../lib/shared';
import { isEnrichedUnifiedProperty } from '../lib/shared';
import { formatPrice, formatPriceWithSeparators, formatNumberWithSeparators } from '@/lib/format';
import { generatePriceAnalysisBadgeHtml } from './markers';
import { PROPERTY_MARKER_COLORS } from '../lib';

// ============================================================================
// Popup Style Constants
// ============================================================================

/** Popup dimension constants */
const POPUP_DIMENSIONS = {
  /** Minimum width for property popups */
  MIN_WIDTH_PROPERTY: 220,
  /** Minimum width for cluster popups */
  MIN_WIDTH_CLUSTER: 240,
  /** Minimum width for loading/error popups */
  MIN_WIDTH_STATUS: 200,
  /** Maximum width for all popups */
  MAX_WIDTH: 280,
  /** Maximum image height in property popup */
  MAX_IMAGE_HEIGHT: 180,
  /** Image height in cluster popup */
  CLUSTER_IMAGE_HEIGHT: 160,
} as const;

/** Popup color palette - Tailwind-based colors */
const POPUP_COLORS = {
  // Text colors
  TEXT_PRIMARY: '#1f2937',    // Gray-800
  TEXT_SECONDARY: '#4b5563',  // Gray-600
  TEXT_MUTED: '#6b7280',      // Gray-500
  TEXT_LIGHT: '#9ca3af',      // Gray-400
  
  // Background colors
  BG_LIGHT: '#f3f4f6',        // Gray-100
  BG_OVERLAY: 'rgba(0,0,0,0.5)',
  
  // Accent colors
  PRICE_GREEN: '#16a34a',     // Green-600
  LINK_BLUE: '#3b82f6',       // Blue-500
  ERROR_RED: '#ef4444',       // Red-500
  
  // Border colors
  BORDER_LIGHT: '#f3f4f6',    // Gray-100
  BORDER_SPINNER: '#e5e7eb',  // Gray-200
  
  // Button states
  BUTTON_DISABLED: '#d1d5db', // Gray-300
} as const;

/** Common style for gallery navigation buttons */
const GALLERY_NAV_BUTTON_STYLE = `background: ${POPUP_COLORS.BG_OVERLAY}; color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;`;

/** Data source badge colors */
const SOURCE_BADGE_COLORS: Record<string, string> = {
  otodom: '#2563eb',  // Blue-600
  gratka: '#7c3aed',  // Violet-600
};

/** Data source display names */
const SOURCE_BADGE_NAMES: Record<string, string> = {
  otodom: 'Otodom',
  gratka: 'Gratka',
};

/**
 * Translations for property popups
 */
export interface PropertyPopupTranslations {
  house: string;
  flat: string;
  priceNegotiable: string;
  rooms: string;
  loadingOffers: string;
  noOffersFound: string;
  similar: string;
  priceCategoryGreatDeal: string;
  priceCategoryGoodDeal: string;
  priceCategoryFair: string;
  priceCategoryAboveAvg: string;
  priceCategoryOverpriced: string;
}

export const DEFAULT_POPUP_TRANSLATIONS: PropertyPopupTranslations = {
  house: 'House',
  flat: 'Apartment',
  priceNegotiable: 'Price negotiable',
  rooms: 'rooms',
  loadingOffers: 'Loading {count} offers...',
  noOffersFound: 'No offers found in this area',
  similar: 'similar',
  priceCategoryGreatDeal: 'Great Deal',
  priceCategoryGoodDeal: 'Good Deal',
  priceCategoryFair: 'Fair Price',
  priceCategoryAboveAvg: 'Above Avg',
  priceCategoryOverpriced: 'Overpriced',
};

// ============================================================================
// Shared Popup HTML Helpers
// ============================================================================

/**
 * Generate the external link SVG icon
 */
function getExternalLinkIcon(): string {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${POPUP_COLORS.TEXT_MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    <polyline points="15 3 21 3 21 9"></polyline>
    <line x1="10" y1="14" x2="21" y2="3"></line>
  </svg>`;
}

/**
 * Generate title link HTML with external link icon
 */
function generateTitleLinkHtml(
  url: string,
  title: string,
  fontSize: string = '13px'
): string {
  return `
    <a 
      href="${url}" 
      target="_blank" 
      rel="noopener noreferrer"
      style="display: flex; align-items: flex-start; gap: 4px; font-weight: 600; font-size: ${fontSize}; margin-bottom: 6px; line-height: 1.3; color: ${POPUP_COLORS.TEXT_PRIMARY}; text-decoration: none;"
    >
      <span style="flex: 1; max-height: 2.6em; overflow: hidden;">${title}</span>
      ${getExternalLinkIcon()}
    </a>
  `;
}

/**
 * Generate property type badge HTML
 */
function generateTypeBadgeHtml(
  estateType: string,
  translations: PropertyPopupTranslations
): { color: string; text: string; html: string } {
  const isHouse = estateType === 'HOUSE';
  const color = (estateType in PROPERTY_MARKER_COLORS) 
    ? PROPERTY_MARKER_COLORS[estateType as keyof typeof PROPERTY_MARKER_COLORS] 
    : PROPERTY_MARKER_COLORS.FLAT;
  const text = isHouse ? translations.house : translations.flat;
  const html = `<div style="position: absolute; top: 8px; left: 8px; background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">${text}</div>`;
  return { color, text, html };
}

/**
 * Generate data source badge HTML
 * Shows which source (Otodom, Gratka) the property came from
 */
function generateSourceBadgeHtml(source: string): string {
  const color = SOURCE_BADGE_COLORS[source] ?? POPUP_COLORS.TEXT_MUTED;
  const name = SOURCE_BADGE_NAMES[source] ?? source;
  return `<span style="background: ${color}; color: white; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px;">${name}</span>`;
}

/**
 * Generate property details HTML (area, rooms, price per meter)
 * 
 * Now accepts unified property fields:
 * - area: number (was areaInSquareMeters)
 * - rooms: number | null (was roomsNumber string)
 * - pricePerMeter: number | null
 */
function generatePropertyDetailsHtml(
  area: number,
  rooms: number | null,
  pricePerMeter: number | null,
  translations: PropertyPopupTranslations,
  fontSize: string = '12px'
): string {
  const pricePerMeterRounded = pricePerMeter !== null ? Math.round(pricePerMeter) : null;
  
  return `
    <div style="display: flex; align-items: center; gap: 4px; color: ${POPUP_COLORS.TEXT_SECONDARY}; font-size: ${fontSize};">
      <span style="font-weight: 500;">${area} m²</span>
      ${rooms !== null ? `<span style="color: ${POPUP_COLORS.TEXT_LIGHT};">•</span><span style="font-weight: 500;">${rooms} ${translations.rooms}</span>` : ''}
      ${pricePerMeterRounded ? `<span style="color: ${POPUP_COLORS.TEXT_LIGHT};">•</span><span style="color: ${POPUP_COLORS.TEXT_MUTED};">${formatNumberWithSeparators(pricePerMeterRounded)} PLN/m²</span>` : ''}
    </div>
  `;
}

/**
 * Generate gallery navigation button HTML
 */
function generateGalleryNavButtonHtml(
  direction: 'prev' | 'next',
  buttonId: string | null,
  disabled: boolean = false
): string {
  const isLeft = direction === 'prev';
  const position = isLeft ? 'left: 8px;' : 'right: 8px;';
  const symbol = isLeft ? '‹' : '›';
  const idAttr = buttonId ? `id="${buttonId}"` : '';
  const opacity = disabled ? 'opacity: 0.3;' : '';
  
  return `
    <button 
      ${idAttr}
      style="position: absolute; ${position} top: calc(50% + 12px); transform: translateY(-50%); ${GALLERY_NAV_BUTTON_STYLE} ${opacity}"
    >${symbol}</button>
  `;
}

/**
 * Generate image counter badge HTML
 */
function generateImageCounterHtml(
  counterId: string | null,
  currentIndex: number,
  totalCount: number
): string {
  const idAttr = counterId ? `id="${counterId}"` : '';
  return `<span ${idAttr} style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: ${POPUP_COLORS.BG_OVERLAY}; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${currentIndex + 1}/${totalCount}</span>`;
}

/**
 * Generate popup HTML for a single property (unified format)
 */
export function generatePropertyPopupHtml(
  property: EnrichedUnifiedProperty,
  galleryId: string,
  translations: PropertyPopupTranslations = DEFAULT_POPUP_TRANSLATIONS
): string {
  // Create image gallery HTML if multiple images
  const imageCount = property.images.length;
  let imageHtml = '';

  // Property type badge
  const typeBadge = generateTypeBadgeHtml(property.estateType, translations);
  
  if (imageCount > 0) {
    const imagesJson = JSON.stringify(property.images.map(img => img.medium)).replace(/"/g, '&quot;');
    
    // Gallery navigation buttons (only if multiple images)
    const galleryNavHtml = imageCount > 1 ? `
      <button 
        onclick="(function(){
          var imgs = ${imagesJson};
          var img = document.getElementById('${galleryId}-img');
          var counter = document.getElementById('${galleryId}-counter');
          var idx = parseInt(counter.textContent) - 1;
          idx = (idx - 1 + imgs.length) % imgs.length;
          img.src = imgs[idx];
          counter.textContent = idx + 1;
        })()"
        style="position: absolute; left: 8px; top: calc(50% + 12px); transform: translateY(-50%); ${GALLERY_NAV_BUTTON_STYLE}"
      >‹</button>
      ${generateImageCounterHtml(`${galleryId}-counter`, 0, imageCount)}
      <button 
        onclick="(function(){
          var imgs = ${imagesJson};
          var img = document.getElementById('${galleryId}-img');
          var counter = document.getElementById('${galleryId}-counter');
          var idx = parseInt(counter.textContent.split('/')[0]) - 1;
          idx = (idx + 1) % imgs.length;
          img.src = imgs[idx];
          counter.textContent = (idx + 1) + '/${imageCount}';
        })()"
        style="position: absolute; right: 8px; top: calc(50% + 12px); transform: translateY(-50%); ${GALLERY_NAV_BUTTON_STYLE}"
      >›</button>
    ` : '';
    
    imageHtml = `
      <div style="position: relative; background: ${POPUP_COLORS.BG_LIGHT}; border-radius: 8px 8px 0 0; overflow: hidden;">
        <img 
          id="${galleryId}-img" 
          src="${property.images[0].medium}" 
          alt="" 
          style="width: 100%; height: auto; max-height: ${POPUP_DIMENSIONS.MAX_IMAGE_HEIGHT}px; object-fit: contain; display: block;" 
          onerror="this.style.display='none'" 
        />
        ${typeBadge.html}
        ${galleryNavHtml}
      </div>
    `;
  }

  // Generate price analysis badge HTML using shared utility
  const priceAnalysisBadgeHtml = property.priceAnalysis 
    ? generatePriceAnalysisBadgeHtml(property.priceAnalysis, translations)
    : '';

  // Price display - null means price is hidden/negotiable
  const priceDisplay = property.price === null 
    ? translations.priceNegotiable 
    : formatPrice(property.price, property.currency);

  // Source badge
  const sourceBadgeHtml = generateSourceBadgeHtml(property.source);

  return `
    <div style="min-width: ${POPUP_DIMENSIONS.MIN_WIDTH_PROPERTY}px; max-width: ${POPUP_DIMENSIONS.MAX_WIDTH}px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
      ${imageHtml}
      <div style="padding: 12px;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
          ${generateTitleLinkHtml(property.url, property.title, '13px')}
          ${sourceBadgeHtml}
        </div>
        <div style="font-size: 16px; font-weight: 700; color: ${POPUP_COLORS.PRICE_GREEN}; margin-bottom: 8px;">
          ${priceDisplay}
        </div>
        ${priceAnalysisBadgeHtml}
        ${generatePropertyDetailsHtml(property.area, property.rooms, property.pricePerMeter, translations, '12px')}
      </div>
    </div>
  `;
}

/**
 * Generate popup HTML for a property in a cluster (with pagination)
 * Accepts unified property format
 */
export function generateClusterPropertyPopupHtml(
  property: UnifiedProperty | EnrichedUnifiedProperty,
  clusterId: string,
  currentIndex: number,
  totalCount: number,
  fetchedCount: number,
  imageIndex: number = 0,
  translations: PropertyPopupTranslations = DEFAULT_POPUP_TRANSLATIONS
): string {
  const typeBadge = generateTypeBadgeHtml(property.estateType, translations);
  
  const hasMultipleImages = property.images.length > 1;
  const currentImage = property.images[imageIndex] || property.images[0];
  
  // Show "X / Y" where X is current position and Y is total
  const paginationText = `${currentIndex + 1} / ${totalCount}`;
  
  // Disable next button when we've reached the end of fetched properties
  const isAtEnd = currentIndex >= fetchedCount - 1;

  // Generate price analysis badge HTML for cluster popup (only if enriched)
  let clusterPriceAnalysisBadgeHtml = '';
  if (isEnrichedUnifiedProperty(property) && property.priceAnalysis) {
    clusterPriceAnalysisBadgeHtml = generatePriceAnalysisBadgeHtml(property.priceAnalysis, translations);
  }

  // Price display - null means price is hidden/negotiable
  const priceDisplay = property.price === null 
    ? translations.priceNegotiable 
    : formatPriceWithSeparators(property.price, property.currency);

  // Source badge
  const sourceBadgeHtml = generateSourceBadgeHtml(property.source);

  const imageHtml = property.images.length > 0 ? `
    <div style="position: relative; background: ${POPUP_COLORS.BG_LIGHT}; border-radius: 8px 8px 0 0; overflow: hidden;">
      <img 
        id="${clusterId}-img"
        src="${currentImage.medium}" 
        alt="" 
        style="width: 100%; height: ${POPUP_DIMENSIONS.CLUSTER_IMAGE_HEIGHT}px; object-fit: cover; display: block;" 
        onerror="this.style.display='none'" 
      />
      ${typeBadge.html}
      ${hasMultipleImages ? `
        ${generateGalleryNavButtonHtml('prev', `${clusterId}-img-prev`, imageIndex === 0)}
        ${generateImageCounterHtml(null, imageIndex, property.images.length)}
        ${generateGalleryNavButtonHtml('next', `${clusterId}-img-next`, imageIndex >= property.images.length - 1)}
      ` : ''}
    </div>
  ` : `
    <div style="background: ${POPUP_COLORS.BG_LIGHT}; border-radius: 8px 8px 0 0; padding: 20px; text-align: center;">
      <div style="display: inline-block; background: ${typeBadge.color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
        ${typeBadge.text}
      </div>
    </div>
  `;

  return `
    <div style="min-width: ${POPUP_DIMENSIONS.MIN_WIDTH_CLUSTER}px; max-width: ${POPUP_DIMENSIONS.MAX_WIDTH}px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
      ${imageHtml}
      <div style="padding: 12px;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
          ${generateTitleLinkHtml(property.url, property.title, '12px')}
          ${sourceBadgeHtml}
        </div>
        <div style="font-size: 15px; font-weight: 700; color: ${POPUP_COLORS.PRICE_GREEN}; margin-bottom: 6px;">
          ${priceDisplay}
        </div>
        ${clusterPriceAnalysisBadgeHtml}
        ${generatePropertyDetailsHtml(property.area, property.rooms, property.pricePerMeter, translations, '11px')}
        
        <!-- Subtle pagination at bottom -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 8px; margin-top: 8px; border-top: 1px solid ${POPUP_COLORS.BORDER_LIGHT};">
          <button 
            id="${clusterId}-prev"
            style="background: none; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; color: ${currentIndex === 0 ? POPUP_COLORS.BUTTON_DISABLED : POPUP_COLORS.TEXT_MUTED}; ${currentIndex === 0 ? 'cursor: default;' : ''}"
          >‹</button>
          <span style="font-size: 11px; color: ${POPUP_COLORS.TEXT_LIGHT};">${paginationText}</span>
          <button 
            id="${clusterId}-next"
            style="background: none; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; color: ${isAtEnd ? POPUP_COLORS.BUTTON_DISABLED : POPUP_COLORS.TEXT_MUTED}; ${isAtEnd ? 'cursor: default;' : ''}"
          >›</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate loading popup HTML for clusters
 */
export function generateLoadingPopupHtml(
  count: number,
  translations: PropertyPopupTranslations = DEFAULT_POPUP_TRANSLATIONS
): string {
  const loadingText = translations.loadingOffers.replace('{count}', String(count));
  return `
    <div style="min-width: ${POPUP_DIMENSIONS.MIN_WIDTH_STATUS}px; padding: 24px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: inline-block; width: 24px; height: 24px; border: 2px solid ${POPUP_COLORS.BORDER_SPINNER}; border-top-color: ${POPUP_COLORS.LINK_BLUE}; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 12px; color: ${POPUP_COLORS.TEXT_MUTED}; font-size: 12px;">${loadingText}</div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    </div>
  `;
}

/**
 * Generate error popup HTML
 */
export function generateErrorPopupHtml(message: string): string {
  return `
    <div style="min-width: ${POPUP_DIMENSIONS.MIN_WIDTH_STATUS}px; padding: 24px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <div style="color: ${POPUP_COLORS.ERROR_RED}; font-size: 12px;">${message}</div>
    </div>
  `;
}
