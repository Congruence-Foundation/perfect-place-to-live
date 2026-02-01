'use client';

import { getExtensionRegistry } from '@/extensions/registry';
// Import init to ensure extensions are registered
import '@/extensions/init';

/**
 * ExtensionsDebugPanel Component
 * 
 * Generic component that renders all extension debug panels.
 * Each extension can provide a DebugPanel component that will be rendered here.
 * The debug panels are self-contained and manage their own state internally.
 */
export function ExtensionsDebugPanel() {
  const registry = getExtensionRegistry();
  const extensions = registry.getAll();
  
  return (
    <>
      {extensions.map((extension) => {
        const DebugPanel = extension.DebugPanel;
        if (!DebugPanel) return null;
        
        return <DebugPanel key={extension.id} />;
      })}
    </>
  );
}
