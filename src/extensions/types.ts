import type { HeatmapSettings } from '@/types';

/** Props for extension settings panel components */
export interface ExtensionSettingsPanelProps {
  /** Heatmap settings (for extensions that need to modify global settings) */
  settings: HeatmapSettings;
  /** Callback to update heatmap settings */
  onSettingsChange: (settings: Partial<HeatmapSettings>) => void;
}

/** Component type for self-contained panels (no props required) */
type SelfContainedComponent = React.ComponentType<Record<string, never>>;

/**
 * Main extension interface.
 * Extensions implement this to integrate with the map.
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
   */
  Controller?: React.ComponentType;
  
  /** Sidebar panel component (desktop) */
  SidebarPanel?: SelfContainedComponent;
  
  /** Bottom sheet content component (mobile) */
  BottomSheetContent?: SelfContainedComponent;
  
  /** Settings panel component */
  SettingsPanel?: React.ComponentType<ExtensionSettingsPanelProps>;
  
  /** Debug panel component */
  DebugPanel?: SelfContainedComponent;
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
