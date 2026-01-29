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
  cemeteries: '#57534e',   // stone
  construction: '#fbbf24', // amber
};

/**
 * Color interpolation for K values
 * Uses ABSOLUTE K values (not normalized) so colors are consistent
 * K is 0-1 where 0 = excellent, 1 = poor
 */
export function getColorForK(k: number): string {
  // Color stops: green (good, low K) to red (bad, high K)
  const colors = [
    { pos: 0, r: 22, g: 163, b: 74 },    // green-600 - excellent (K=0)
    { pos: 0.25, r: 101, g: 163, b: 13 }, // lime-600
    { pos: 0.5, r: 202, g: 138, b: 4 },   // yellow-600
    { pos: 0.75, r: 234, g: 88, b: 12 },  // orange-600
    { pos: 1, r: 220, g: 38, b: 38 },     // red-600 - poor (K=1)
  ];
  
  // Clamp K to 0-1 range
  const normalized = Math.max(0, Math.min(1, k));
  
  // Find the two colors to interpolate between
  let lower = colors[0];
  let upper = colors[colors.length - 1];
  
  for (let i = 0; i < colors.length - 1; i++) {
    if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {
      lower = colors[i];
      upper = colors[i + 1];
      break;
    }
  }
  
  // Interpolate
  const range = upper.pos - lower.pos;
  const t = range > 0 ? (normalized - lower.pos) / range : 0;
  
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);
  
  return `rgb(${r},${g},${b})`;
}
