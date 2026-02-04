'use client';

import { getExtensionRegistry } from './registry';
import type { MapExtension, ExtensionSettingsPanelProps } from './types';
import './init'; // Side-effect import: registers extensions on module load

/** Component keys that extensions can provide */
type ExtensionComponentKey = keyof Pick<
  MapExtension,
  'Controller' | 'SidebarPanel' | 'BottomSheetContent' | 'SettingsPanel' | 'DebugPanel'
>;

/** Get all registered extensions */
export function getExtensions(): MapExtension[] {
  return getExtensionRegistry().getAll();
}

/**
 * Render extension components of a specific type.
 * 
 * @param componentKey - The component type to render from each extension
 * @param props - Props to pass (only used for SettingsPanel)
 */
function renderExtensionComponents<K extends ExtensionComponentKey>(
  componentKey: K,
  props?: K extends 'SettingsPanel' ? ExtensionSettingsPanelProps : undefined
): React.ReactNode[] {
  return getExtensions()
    .map((extension) => {
      const Component = extension[componentKey];
      if (!Component) return null;
      
      if (componentKey === 'SettingsPanel' && props) {
        const SettingsComponent = Component as React.ComponentType<ExtensionSettingsPanelProps>;
        return <SettingsComponent key={extension.id} {...props} />;
      }
      
      const SelfContainedComponent = Component as React.ComponentType;
      return <SelfContainedComponent key={extension.id} />;
    })
    .filter(Boolean);
}

/**
 * Hook to render extension components of a specific type.
 * Returns the components wrapped in a fragment, ready to render.
 */
export function useExtensionComponents<K extends ExtensionComponentKey>(
  componentKey: K,
  props?: K extends 'SettingsPanel' ? ExtensionSettingsPanelProps : undefined
): React.ReactNode {
  return <>{renderExtensionComponents(componentKey, props)}</>;
}
