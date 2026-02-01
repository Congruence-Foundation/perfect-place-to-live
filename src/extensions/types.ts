import type { Bounds, HeatmapPoint, POI, Factor } from '@/types';

/**
 * Context provided by the map to extensions
 */
export interface MapContext {
  /** Current map bounds */
  bounds: Bounds | null;
  /** Current zoom level */
  zoom: number;
  /** Heatmap data points */
  heatmapPoints: HeatmapPoint[];
  /** POIs grouped by factor ID */
  pois: Record<string, POI[]>;
  /** Active factors with weights */
  factors: Factor[];
  /** Grid cell size in meters */
  gridCellSize: number;
}

/**
 * Events emitted by the map that extensions can subscribe to
 */
export interface MapEvents {
  /** Called when map bounds or zoom changes */
  onBoundsChange?: (bounds: Bounds, zoom: number) => void;
  /** Called when map is clicked (right-click or long-press) */
  onMapClick?: (lat: number, lng: number) => void;
}

/**
 * A layer that an extension can add to the map
 */
export interface ExtensionLayer {
  /** Unique identifier for this layer */
  id: string;
  /** Z-index for layer ordering (higher = on top) */
  zIndex: number;
  /** Whether the layer is currently visible */
  visible: boolean;
  /** 
   * Create and return the Leaflet layer group
   * Called when the layer should be added to the map
   */
  createLayer: (L: typeof import('leaflet'), map: L.Map) => L.LayerGroup;
  /**
   * Update the layer when context changes
   * Called on bounds change, data updates, etc.
   */
  update?: (context: MapContext) => void;
  /**
   * Cleanup when layer is removed
   */
  destroy?: () => void;
}

/**
 * Props passed to extension sidebar panel components
 * Note: Sidebar panels are self-contained and manage their own state internally
 */
export interface ExtensionSidebarProps {
  // No props needed - sidebar panels are self-contained
}

/**
 * Props passed to extension bottom sheet content (mobile)
 * Note: Bottom sheet content is self-contained and manages its own state internally
 */
export interface ExtensionBottomSheetProps {
  // No props needed - bottom sheet content is self-contained
}

// ============================================================================
// Settings Panel Extension Interface
// ============================================================================

/**
 * A settings item that an extension can contribute to the settings panel
 */
export interface ExtensionSettingsItem {
  /** Unique identifier for this setting */
  id: string;
  /** Display label */
  label: string;
  /** Optional tooltip/description */
  tooltip?: string;
  /** Setting type */
  type: 'toggle' | 'slider' | 'select' | 'custom';
  /** Current value */
  value: unknown;
  /** Callback when value changes */
  onChange: (value: unknown) => void;
  /** Options for select type */
  options?: Array<{ value: string; label: string }>;
  /** Min/max for slider type */
  min?: number;
  max?: number;
  step?: number;
  /** Custom render function for 'custom' type */
  render?: () => React.ReactNode;
}

/**
 * Settings section that an extension can contribute
 */
export interface ExtensionSettingsSection {
  /** Section identifier */
  id: string;
  /** Section title */
  title: string;
  /** Whether section is collapsible */
  collapsible?: boolean;
  /** Whether section is initially expanded */
  defaultExpanded?: boolean;
  /** Settings items in this section */
  items: ExtensionSettingsItem[];
}

/**
 * Props passed to extension settings panel components
 */
export interface ExtensionSettingsPanelProps {
  /** Heatmap settings (for extensions that need to modify global settings) */
  settings: import('@/types').HeatmapSettings;
  /** Callback to update heatmap settings */
  onSettingsChange: (settings: Partial<import('@/types').HeatmapSettings>) => void;
}

// ============================================================================
// Debug Panel Extension Interface
// ============================================================================

/**
 * A debug info item that an extension can contribute
 */
export interface ExtensionDebugItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Value to display (string, number, or custom render) */
  value: string | number | (() => React.ReactNode);
  /** Optional color for the value */
  color?: 'default' | 'success' | 'warning' | 'error';
  /** Whether to show only when extension is enabled */
  showOnlyWhenEnabled?: boolean;
}

/**
 * Debug section that an extension can contribute
 */
export interface ExtensionDebugSection {
  /** Section identifier */
  id: string;
  /** Section title (optional, for grouping) */
  title?: string;
  /** Debug items in this section */
  items: ExtensionDebugItem[];
}

/**
 * Props passed to extension debug panel components
 */
export interface ExtensionDebugPanelProps {
  // No props needed - debug panels are self-contained
}

/**
 * Main extension interface
 * Extensions implement this to integrate with the map
 */
export interface MapExtension {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  
  /**
   * Controller component that handles side effects (fetching, rendering, etc.)
   * This component should return null (no UI) and is rendered once at the app level.
   * Use this for extensions that need to react to map state changes.
   */
  Controller?: React.ComponentType;
  
  /**
   * Called when extension is mounted and map is ready
   */
  onMount?: (map: L.Map, context: MapContext) => void;
  
  /**
   * Called when extension is unmounted
   */
  onUnmount?: () => void;
  
  /**
   * Called when map context changes (bounds, zoom, heatmap data, etc.)
   */
  onContextChange?: (context: MapContext) => void;
  
  /**
   * Layers this extension provides
   */
  getLayers?: () => ExtensionLayer[];
  
  /**
   * Sidebar panel component (desktop)
   */
  SidebarPanel?: React.ComponentType<ExtensionSidebarProps>;
  
  /**
   * Bottom sheet content component (mobile)
   */
  BottomSheetContent?: React.ComponentType<ExtensionBottomSheetProps>;
  
  /**
   * Get settings sections to contribute to the settings panel
   * Called when settings panel is rendered
   */
  getSettingsSections?: () => ExtensionSettingsSection[];
  
  /**
   * Custom settings panel component (alternative to getSettingsSections)
   * Use this for complex settings UI that doesn't fit the standard pattern
   */
  SettingsPanel?: React.ComponentType<ExtensionSettingsPanelProps>;
  
  /**
   * Get debug info sections to contribute to the debug panel
   * Called when debug panel is rendered
   */
  getDebugSections?: () => ExtensionDebugSection[];
  
  /**
   * Custom debug panel component (alternative to getDebugSections)
   * Use this for complex debug UI that doesn't fit the standard pattern
   */
  DebugPanel?: React.ComponentType<ExtensionDebugPanelProps>;
}

/**
 * Extension state that can be shared via context
 */
export interface ExtensionState {
  /** Whether the extension is enabled */
  enabled: boolean;
  /** Extension-specific data */
  data?: unknown;
}

/**
 * Registry for managing extensions
 */
export interface ExtensionRegistry {
  /** Register a new extension */
  register: (extension: MapExtension) => void;
  /** Unregister an extension */
  unregister: (extensionId: string) => void;
  /** Get all registered extensions */
  getAll: () => MapExtension[];
  /** Get extension by ID */
  get: (extensionId: string) => MapExtension | undefined;
  /** Get extension state */
  getState: (extensionId: string) => ExtensionState | undefined;
  /** Update extension state */
  setState: (extensionId: string, state: Partial<ExtensionState>) => void;
}
