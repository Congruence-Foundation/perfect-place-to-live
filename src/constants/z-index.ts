/**
 * Centralized z-index values for consistent layering across the application
 */
export const Z_INDEX = {
  /** Floating control panels (AppInfo, MapSettings, DebugInfo) */
  FLOATING_CONTROLS: 1000,
  
  /** Bottom sheet control buttons */
  BOTTOM_SHEET_CONTROLS: 1001,
  
  /** Bottom sheet panel */
  BOTTOM_SHEET: 1002,
  
  /** Dropdown menus */
  DROPDOWN: 1100,
  
  /** Nested dropdown menus */
  NESTED_DROPDOWN: 1200,
  
  /** Tooltips (highest priority) */
  TOOLTIP: 9999,
} as const;

export type ZIndexKey = keyof typeof Z_INDEX;
