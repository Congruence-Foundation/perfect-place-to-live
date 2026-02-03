/**
 * Popup content generation utilities for MapView
 */

import { POI_COLORS, getColorForK } from '@/constants';
import { formatDistance } from '@/lib/utils';
import type { FactorBreakdown } from '@/lib/scoring';

// Popup translations interface
export interface PopupTranslations {
  excellent: string;
  good: string;
  average: string;
  belowAverage: string;
  poor: string;
  footer: string;
  goodLabel: string;
  improveLabel: string;
  noData: string;
}

// Factor name translations type
export type FactorTranslations = Record<string, string>;

// Default translations (English)
export const defaultPopupTranslations: PopupTranslations = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  belowAverage: 'Below Average',
  poor: 'Poor',
  footer: 'Right-click for details',
  goodLabel: 'good',
  improveLabel: 'improve',
  noData: 'No data available for this area. Zoom in or pan to load POIs.',
};

// Default fallback color
const DEFAULT_FALLBACK_COLOR = '#6b7280';

// Get rating label for K value
function getRatingLabel(k: number, translations: PopupTranslations): { label: string; emoji: string } {
  if (k < 0.2) return { label: translations.excellent, emoji: '🌟' };
  if (k < 0.4) return { label: translations.good, emoji: '👍' };
  if (k < 0.6) return { label: translations.average, emoji: '😐' };
  if (k < 0.8) return { label: translations.belowAverage, emoji: '👎' };
  return { label: translations.poor, emoji: '⚠️' };
}

/**
 * Generate popup HTML content - compact version
 */
export function generatePopupContent(
  k: number,
  breakdown: FactorBreakdown[],
  translations: PopupTranslations,
  factorTranslations: FactorTranslations
): string {
  const allNoPOIs = breakdown.length > 0 && breakdown.every(item => item.noPOIs);
  
  if (allNoPOIs) {
    return `
      <div style="min-width: 180px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; text-align: center; padding: 8px;">
        <div style="font-size: 24px; margin-bottom: 8px;">📍</div>
        <div style="color: ${DEFAULT_FALLBACK_COLOR};">${translations.noData}</div>
      </div>
    `;
  }
  
  const rating = getRatingLabel(k, translations);
  const kColor = getColorForK(k);
  const scorePercent = Math.round((1 - k) * 100);

  const breakdownRows = breakdown.map(item => {
    const color = POI_COLORS[item.factorId] || DEFAULT_FALLBACK_COLOR;
    const distanceText = item.noPOIs ? '—' : formatDistance(item.distance);
    const barColor = item.score < 0.3 ? '#22c55e' : item.score < 0.6 ? '#eab308' : '#ef4444';
    const scoreBarWidth = Math.round(item.score * 100);
    const icon = item.isNegative 
      ? (item.score > 0.5 ? '⚠' : '✓') 
      : (item.score < 0.5 ? '✓' : '⚠');
    const iconColor = icon === '✓' ? '#22c55e' : '#ef4444';
    const weightDisplay = item.weight > 0 ? `+${item.weight}` : `${item.weight}`;
    const weightColor = item.weight > 0 ? '#22c55e' : item.weight < 0 ? '#ef4444' : DEFAULT_FALLBACK_COLOR;
    const nearbyText = item.nearbyCount > 1 ? `(${item.nearbyCount})` : '';
    const factorName = factorTranslations[item.factorId] || item.factorName;

    return `
      <tr style="height: 22px;">
        <td style="width: 10px; padding: 2px 0;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: ${color};"></div>
        </td>
        <td style="padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;" title="${factorName}${item.nearbyCount > 1 ? ` - ${item.nearbyCount} nearby` : ''}">
          ${factorName}
        </td>
        <td style="width: 30px; padding: 2px; text-align: right; font-size: 9px; color: ${weightColor};">${weightDisplay}</td>
        <td style="width: 40px; padding: 2px;">
          <div style="height: 3px; background: #e5e7eb; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: ${scoreBarWidth}%; background: ${barColor};"></div>
          </div>
        </td>
        <td style="width: 50px; padding: 2px 4px; text-align: right; color: ${DEFAULT_FALLBACK_COLOR};">${distanceText} <span style="color: #9ca3af; font-size: 8px;">${nearbyText}</span></td>
        <td style="width: 14px; text-align: center; color: ${iconColor}; font-weight: bold;">${icon}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="min-width: 200px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 11px;">
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb;">
        <span style="font-size: 18px;">${rating.emoji}</span>
        <div style="flex: 1;">
          <span style="font-weight: 600; font-size: 13px; color: ${kColor};">${rating.label}</span>
          <span style="color: ${DEFAULT_FALLBACK_COLOR}; margin-left: 4px;">${scorePercent}%</span>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${breakdownRows}
        </tbody>
      </table>
      <div style="font-size: 9px; color: #9ca3af; margin-top: 4px; padding-top: 4px; border-top: 1px solid #e5e7eb;">
        ${translations.footer} • ✓ ${translations.goodLabel} • ⚠ ${translations.improveLabel}
      </div>
    </div>
  `;
}
