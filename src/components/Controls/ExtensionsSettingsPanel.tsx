'use client';

import { getExtensionRegistry } from '@/extensions/registry';
import { HeatmapSettings } from '@/types';
// Import init to ensure extensions are registered
import '@/extensions/init';

interface ExtensionsSettingsPanelProps {
  settings: HeatmapSettings;
  onSettingsChange: (settings: Partial<HeatmapSettings>) => void;
}

/**
 * ExtensionsSettingsPanel Component
 * 
 * Generic component that renders all extension settings panels.
 * Each extension can provide a SettingsPanel component that will be rendered here.
 * The settings panels are self-contained and manage their own state internally.
 */
export function ExtensionsSettingsPanel({ settings, onSettingsChange }: ExtensionsSettingsPanelProps) {
  const registry = getExtensionRegistry();
  const extensions = registry.getAll();
  
  return (
    <>
      {extensions.map((extension) => {
        const SettingsPanel = extension.SettingsPanel;
        if (!SettingsPanel) return null;
        
        return (
          <SettingsPanel 
            key={extension.id} 
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
        );
      })}
    </>
  );
}
