'use client';

import type { HeatmapSettings } from '@/types';
import { renderExtensionComponents } from '@/extensions/utils';

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
  return renderExtensionComponents('SettingsPanel', { settings, onSettingsChange });
}
