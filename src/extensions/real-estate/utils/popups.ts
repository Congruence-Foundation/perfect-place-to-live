import type { OtodomProperty, EnrichedProperty } from '../types';
import { formatPrice, roomCountToNumber } from '@/lib/format';
import { generatePriceAnalysisBadgeHtml } from './markers';

/**
 * Type guard to check if a property is enriched with price analysis
 */
function isEnrichedProperty(property: OtodomProperty | EnrichedProperty): property is EnrichedProperty {
  return 'priceAnalysis' in property;
}

/**
 * Generate popup HTML for a single property
 */
export function generatePropertyPopupHtml(
  property: EnrichedProperty,
  galleryId: string
): string {
  const pricePerMeter = property.areaInSquareMeters > 0
    ? Math.round(property.totalPrice.value / property.areaInSquareMeters)
    : null;

  // Create image gallery HTML if multiple images
  const imageCount = property.images.length;
  let imageHtml = '';

  // Property type badge
  const isHouse = property.estate === 'HOUSE';
  const typeBadgeColor = isHouse ? '#16a34a' : '#3b82f6';
  const typeBadgeText = isHouse ? 'Dom' : 'Mieszkanie';
  
  if (imageCount > 0) {
    const imagesJson = JSON.stringify(property.images.map(img => img.medium)).replace(/"/g, '&quot;');
    imageHtml = `
      <div style="position: relative; background: #f3f4f6; border-radius: 8px 8px 0 0; overflow: hidden;">
        <img 
          id="${galleryId}-img" 
          src="${property.images[0].medium}" 
          alt="" 
          style="width: 100%; height: auto; max-height: 180px; object-fit: contain; display: block;" 
          onerror="this.style.display='none'" 
        />
        <!-- Property type badge -->
        <div style="position: absolute; top: 8px; left: 8px; background: ${typeBadgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
          ${typeBadgeText}
        </div>
        ${imageCount > 1 ? `
          <!-- Left button - centered between close button area and bottom -->
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
            style="position: absolute; left: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"
          >‹</button>
          <!-- Counter at bottom center -->
          <span id="${galleryId}-counter" style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px;">1/${imageCount}</span>
          <!-- Right button - centered between close button area and bottom -->
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
            style="position: absolute; right: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"
          >›</button>
        ` : ''}
      </div>
    `;
  }

  // Format rooms display
  const roomsDisplay = property.roomsNumber ? roomCountToNumber(property.roomsNumber) : null;

  // Generate price analysis badge HTML using shared utility
  const priceAnalysisBadgeHtml = property.priceAnalysis 
    ? generatePriceAnalysisBadgeHtml(property.priceAnalysis)
    : '';

  return `
    <div style="min-width: 220px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
      ${imageHtml}
      <div style="padding: 12px;">
        <!-- Title as link -->
        <a 
          href="${property.url}" 
          target="_blank" 
          rel="noopener noreferrer"
          style="display: flex; align-items: flex-start; gap: 4px; font-weight: 600; font-size: 13px; margin-bottom: 6px; line-height: 1.3; color: #1f2937; text-decoration: none;"
        >
          <span style="flex: 1; max-height: 2.6em; overflow: hidden;">${property.title}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
        <!-- Price -->
        <div style="font-size: 16px; font-weight: 700; color: #16a34a; margin-bottom: 8px;">
          ${property.hidePrice ? 'Cena do negocjacji' : formatPrice(property.totalPrice.value, property.totalPrice.currency)}
        </div>
        <!-- Price Analysis Badge -->
        ${priceAnalysisBadgeHtml}
        <!-- Property details -->
        <div style="display: flex; align-items: center; gap: 4px; color: #4b5563; font-size: 12px;">
          <span style="font-weight: 500;">${property.areaInSquareMeters} m²</span>
          ${roomsDisplay ? `<span style="color: #9ca3af;">•</span><span style="font-weight: 500;">${roomsDisplay} pok.</span>` : ''}
          ${pricePerMeter ? `<span style="color: #9ca3af;">•</span><span style="color: #6b7280;">${pricePerMeter.toLocaleString('pl-PL')} PLN/m²</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate popup HTML for a property in a cluster (with pagination)
 */
export function generateClusterPropertyPopupHtml(
  property: OtodomProperty | EnrichedProperty,
  clusterId: string,
  currentIndex: number,
  totalCount: number,
  fetchedCount: number,
  imageIndex: number = 0
): string {
  const isHouse = property.estate === 'HOUSE';
  const typeBadgeColor = isHouse ? '#16a34a' : '#3b82f6';
  const typeBadgeText = isHouse ? 'Dom' : 'Mieszkanie';
  const roomsDisplay = property.roomsNumber ? roomCountToNumber(property.roomsNumber) : null;
  const pricePerMeter = property.areaInSquareMeters > 0
    ? Math.round(property.totalPrice.value / property.areaInSquareMeters)
    : null;
  
  const hasMultipleImages = property.images.length > 1;
  const currentImage = property.images[imageIndex] || property.images[0];
  
  // Show "X / Y" where X is current position and Y is total
  const paginationText = `${currentIndex + 1} / ${totalCount}`;
  
  // Disable next button when we've reached the end of fetched properties
  const isAtEnd = currentIndex >= fetchedCount - 1;

  // Generate price analysis badge HTML for cluster popup (only if enriched)
  const clusterPriceAnalysisBadgeHtml = isEnrichedProperty(property) 
    ? generatePriceAnalysisBadgeHtml(property.priceAnalysis)
    : '';

  const imageHtml = property.images.length > 0 ? `
    <div style="position: relative; background: #f3f4f6; border-radius: 8px 8px 0 0; overflow: hidden;">
      <img 
        id="${clusterId}-img"
        src="${currentImage.medium}" 
        alt="" 
        style="width: 100%; height: 160px; object-fit: cover; display: block;" 
        onerror="this.style.display='none'" 
      />
      <div style="position: absolute; top: 8px; left: 8px; background: ${typeBadgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
        ${typeBadgeText}
      </div>
      ${hasMultipleImages ? `
        <!-- Left button - centered between close button area and bottom -->
        <button 
          id="${clusterId}-img-prev"
          style="position: absolute; left: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; ${imageIndex === 0 ? 'opacity: 0.3;' : ''}"
        >‹</button>
        <!-- Counter at bottom center -->
        <span style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${imageIndex + 1}/${property.images.length}</span>
        <!-- Right button - centered between close button area and bottom -->
        <button 
          id="${clusterId}-img-next"
          style="position: absolute; right: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; ${imageIndex >= property.images.length - 1 ? 'opacity: 0.3;' : ''}"
        >›</button>
      ` : ''}
    </div>
  ` : `
    <div style="background: #f3f4f6; border-radius: 8px 8px 0 0; padding: 20px; text-align: center;">
      <div style="display: inline-block; background: ${typeBadgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
        ${typeBadgeText}
      </div>
    </div>
  `;

  return `
    <div style="min-width: 240px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
      ${imageHtml}
      <div style="padding: 12px;">
        <!-- Title as link -->
        <a 
          href="${property.url}" 
          target="_blank" 
          rel="noopener noreferrer"
          style="display: flex; align-items: flex-start; gap: 4px; font-weight: 600; font-size: 12px; margin-bottom: 6px; line-height: 1.3; color: #1f2937; text-decoration: none;"
        >
          <span style="flex: 1; max-height: 2.6em; overflow: hidden;">${property.title}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
        <div style="font-size: 15px; font-weight: 700; color: #16a34a; margin-bottom: 6px;">
          ${property.hidePrice ? 'Cena do negocjacji' : `${property.totalPrice.value.toLocaleString('pl-PL')} ${property.totalPrice.currency}`}
        </div>
        ${clusterPriceAnalysisBadgeHtml}
        <div style="display: flex; align-items: center; gap: 4px; color: #4b5563; margin-bottom: 8px; font-size: 11px;">
          <span style="font-weight: 500;">${property.areaInSquareMeters} m²</span>
          ${roomsDisplay ? `<span style="color: #9ca3af;">•</span><span style="font-weight: 500;">${roomsDisplay} pok.</span>` : ''}
          ${pricePerMeter ? `<span style="color: #9ca3af;">•</span><span style="color: #6b7280;">${pricePerMeter.toLocaleString('pl-PL')} PLN/m²</span>` : ''}
        </div>
        
        <!-- Subtle pagination at bottom -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 8px; border-top: 1px solid #f3f4f6;">
          <button 
            id="${clusterId}-prev"
            style="background: none; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; color: ${currentIndex === 0 ? '#d1d5db' : '#6b7280'}; ${currentIndex === 0 ? 'cursor: default;' : ''}"
          >‹</button>
          <span style="font-size: 11px; color: #9ca3af;">${paginationText}</span>
          <button 
            id="${clusterId}-next"
            style="background: none; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; color: ${isAtEnd ? '#d1d5db' : '#6b7280'}; ${isAtEnd ? 'cursor: default;' : ''}"
          >›</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate loading popup HTML for clusters
 */
export function generateLoadingPopupHtml(count: number): string {
  return `
    <div style="min-width: 200px; padding: 24px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: inline-block; width: 24px; height: 24px; border: 2px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div style="margin-top: 12px; color: #6b7280; font-size: 12px;">Ładowanie ${count} ofert...</div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    </div>
  `;
}

/**
 * Generate error popup HTML
 */
export function generateErrorPopupHtml(message: string): string {
  return `
    <div style="min-width: 200px; padding: 24px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <div style="color: #ef4444; font-size: 12px; margin-bottom: 12px;">${message}</div>
      <a 
        href="https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie/poznan?viewType=listing" 
        target="_blank" 
        rel="noopener noreferrer"
        style="display: inline-block; background: #3b82f6; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 11px; font-weight: 500;"
      >
        Zobacz na Otodom
      </a>
    </div>
  `;
}

