/**
 * Centralized z-index values for consistent layering across the application
 * 
 * Layer hierarchy (lowest to highest):
 * - Map layers: 200-500 (Leaflet internal)
 * - Floating controls: 1000-1002
 * - Dropdowns/Selects: 1100-1200
 * - Tooltips: 9999
 */
export const Z_INDEX = {
  // Map layers (Leaflet)
  /** Leaflet map heatmap pane (below tile pane at 200, above overlay pane at 400) */
  MAP_HEATMAP_PANE: 450,
  /** Tile border debug pane (above heatmap) */
  MAP_TILE_BORDER_PANE: 500,
  
  // Floating UI controls
  /** Base level for floating controls (settings, debug, info panels) */
  FLOATING_CONTROLS: 1000,
  /** Search box and primary controls */
  SEARCH_BOX: 1001,
  /** Control panel and sidebar toggle */
  CONTROL_PANEL: 1002,
  /** Bottom sheet overlay */
  BOTTOM_SHEET: 1002,
  
  // Dropdowns and popovers
  /** Dropdown content (Select, Popover) */
  DROPDOWN: 1100,
  /** Nested dropdown content */
  NESTED_DROPDOWN: 1200,
  
  // Tooltips (highest priority)
  /** Tooltips should always be on top */
  TOOLTIP: 9999,
} as const;
