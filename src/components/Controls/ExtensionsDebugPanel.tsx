'use client';

import { useExtensionComponents } from '@/extensions/utils';

/**
 * ExtensionsDebugPanel Component
 * 
 * Generic component that renders all extension debug panels.
 * Each extension can provide a DebugPanel component that will be rendered here.
 * The debug panels are self-contained and manage their own state internally.
 */
export function ExtensionsDebugPanel() {
  return useExtensionComponents('DebugPanel');
}
