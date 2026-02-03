/**
 * Centralized z-index values for consistent layering across the application
 */
export const Z_INDEX = {
  /** Leaflet map heatmap pane (below tile pane at 200, above overlay pane at 400) */
  MAP_HEATMAP_PANE: 450,
} as const;
