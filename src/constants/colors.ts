/**
 * POI marker colors by category
 * Used for map markers and factor indicators
 */
export const POI_COLORS: Record<string, string> = {
  grocery: '#22c55e',      // green
  transit: '#3b82f6',      // blue
  healthcare: '#ef4444',   // red
  parks: '#84cc16',        // lime
  schools: '#f59e0b',      // amber
  post: '#8b5cf6',         // violet
  restaurants: '#ec4899',  // pink
  banks: '#14b8a6',        // teal
  gyms: '#f97316',         // orange
  playgrounds: '#a855f7',  // purple
  industrial: '#6b7280',   // gray
  highways: '#374151',     // dark gray
  stadiums: '#dc2626',     // red
  nightlife: '#7c3aed',    // violet
  universities: '#0891b2', // cyan
  religious: '#ca8a04',    // yellow
  dog_parks: '#65a30d',    // lime
  coworking: '#0284c7',    // sky
  cinemas: '#be185d',      // pink
  markets: '#ea580c',      // orange
  water: '#0ea5e9',        // sky
  airports: '#64748b',     // slate
  railways: '#78716c',     // stone
  train_stations: '#3b82f6', // blue (same as transit)
  cemeteries: '#57534e',   // stone
  construction: '#fbbf24', // amber
  city_center: '#6366f1',  // indigo
  city_downtown: '#a855f7', // purple
};

/**
 * Default fallback color for unknown categories or missing data
 * Gray-500 from Tailwind
 */
export const DEFAULT_FALLBACK_COLOR = '#6b7280';

/**
 * Score-based colors for heatmap and popup displays
 * Used for rating bars, score indicators, quality badges, and gradients
 * 
 * K value scale: 0 = excellent (green), 1 = poor (red)
 */
export const SCORE_COLORS = {
  /** Excellent/Good score (low K value) - Green-500 */
  GOOD: '#22c55e',
  /** Average score - Amber-500 */
  AVERAGE: '#f59e0b',
  /** Poor score (high K value) - Red-500 */
  POOR: '#ef4444',
} as const;

/**
 * Score thresholds for categorizing K values
 * K is 0-1 where 0 = excellent, 1 = poor
 */
export const SCORE_THRESHOLDS = {
  /** Threshold for excellent rating (K < 0.2) */
  EXCELLENT: 0.2,
  /** Threshold for good rating (K < 0.4) */
  GOOD: 0.4,
  /** Threshold for average rating (K < 0.6) */
  AVERAGE: 0.6,
  /** Threshold for below average rating (K < 0.8) */
  BELOW_AVERAGE: 0.8,
  /** Threshold for good bar color (K < 0.3) */
  BAR_GOOD: 0.3,
  /** Threshold for average bar color (K < 0.6) */
  BAR_AVERAGE: 0.6,
} as const;

/**
 * UI colors for common elements
 */
export const UI_COLORS = {
  /** Border color - Gray-200 */
  BORDER: '#e5e7eb',
  /** Muted text color - Gray-400 */
  MUTED_TEXT: '#9ca3af',
} as const;

/**
 * Debug visualization colors
 */
export const DEBUG_COLORS = {
  /** Heatmap tile border color (blue) */
  HEATMAP_TILE_BORDER: '#3b82f6',
  /** Property tile border color (orange) */
  PROPERTY_TILE_BORDER: '#f97316',
} as const;

/** Color stop for gradient interpolation */
interface ColorStop {
  pos: number;
  r: number;
  g: number;
  b: number;
}

/** 
 * Color gradient stops from green (excellent) to red (poor)
 * Used for K value visualization where K is 0-1
 */
const K_VALUE_GRADIENT: ColorStop[] = [
  { pos: 0, r: 22, g: 163, b: 74 },     // green-600 - excellent (K=0)
  { pos: 0.25, r: 101, g: 163, b: 13 }, // lime-600
  { pos: 0.5, r: 202, g: 138, b: 4 },   // yellow-600
  { pos: 0.75, r: 234, g: 88, b: 12 },  // orange-600
  { pos: 1, r: 220, g: 38, b: 38 },     // red-600 - poor (K=1)
];

/**
 * Color interpolation for K values
 * Uses ABSOLUTE K values (not normalized) so colors are consistent
 * K is 0-1 where 0 = excellent, 1 = poor
 */
export function getColorForK(k: number): string {
  if (!Number.isFinite(k)) {
    return DEFAULT_FALLBACK_COLOR;
  }
  
  // Clamp K to 0-1 range
  const clamped = Math.max(0, Math.min(1, k));
  
  // Find the two color stops to interpolate between
  let lower = K_VALUE_GRADIENT[0];
  let upper = K_VALUE_GRADIENT[K_VALUE_GRADIENT.length - 1];
  
  for (let i = 0; i < K_VALUE_GRADIENT.length - 1; i++) {
    if (clamped >= K_VALUE_GRADIENT[i].pos && clamped <= K_VALUE_GRADIENT[i + 1].pos) {
      lower = K_VALUE_GRADIENT[i];
      upper = K_VALUE_GRADIENT[i + 1];
      break;
    }
  }
  
  // Interpolate between the two stops
  const range = upper.pos - lower.pos;
  const t = range > 0 ? (clamped - lower.pos) / range : 0;
  
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);
  
  return `rgb(${r},${g},${b})`;
}
