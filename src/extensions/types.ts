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

/**
 * Props passed to extension settings panel components
 */
export interface ExtensionSettingsPanelProps {
  /** Heatmap settings (for extensions that need to modify global settings) */
  settings: import('@/types').HeatmapSettings;
  /** Callback to update heatmap settings */
  onSettingsChange: (settings: Partial<import('@/types').HeatmapSettings>) => void;
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
   * Sidebar panel component (desktop)
   */
  SidebarPanel?: React.ComponentType<ExtensionSidebarProps>;
  
  /**
   * Bottom sheet content component (mobile)
   */
  BottomSheetContent?: React.ComponentType<ExtensionBottomSheetProps>;
  
  /**
   * Custom settings panel component
   * Use this for complex settings UI
   */
  SettingsPanel?: React.ComponentType<ExtensionSettingsPanelProps>;
  
  /**
   * Custom debug panel component
   * Use this for complex debug UI
   */
  DebugPanel?: React.ComponentType<ExtensionDebugPanelProps>;
}

/**
 * Registry for managing extensions
 */
export interface ExtensionRegistry {
  /** Register a new extension */
  register: (extension: MapExtension) => void;
  /** Get all registered extensions */
  getAll: () => MapExtension[];
}
