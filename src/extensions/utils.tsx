'use client';

import { getExtensionRegistry } from './registry';
import type { MapExtension, ExtensionSettingsPanelProps } from './types';
// Import init to ensure extensions are registered
import './init';

/**
 * Component key types that extensions can provide
 */
type ExtensionComponentKey = 
  | 'Controller'
  | 'SidebarPanel'
  | 'BottomSheetContent'
  | 'SettingsPanel'
  | 'DebugPanel';

/**
 * Get all extensions from the registry
 */
export function getExtensions(): MapExtension[] {
  const registry = getExtensionRegistry();
  return registry.getAll();
}

/**
 * Render extension components of a specific type
 * 
 * @param componentKey - The component type to render from each extension
 * @param props - Optional props to pass to each component
 * @returns Array of rendered components
 */
export function renderExtensionComponents<K extends ExtensionComponentKey>(
  componentKey: K,
  props?: K extends 'SettingsPanel' ? ExtensionSettingsPanelProps : undefined
): React.ReactNode[] {
  const extensions = getExtensions();
  
  return extensions.map((extension) => {
    const Component = extension[componentKey] as React.ComponentType<ExtensionSettingsPanelProps | Record<string, never>> | undefined;
    if (!Component) return null;
    
    if (componentKey === 'SettingsPanel' && props) {
      return <Component key={extension.id} {...props} />;
    }
    
    return <Component key={extension.id} />;
  }).filter(Boolean);
}

/**
 * Hook to get extension components of a specific type
 * Returns the components ready to render
 */
export function useExtensionComponents<K extends ExtensionComponentKey>(
  componentKey: K,
  props?: K extends 'SettingsPanel' ? ExtensionSettingsPanelProps : undefined
): React.ReactNode {
  return <>{renderExtensionComponents(componentKey, props)}</>;
}
