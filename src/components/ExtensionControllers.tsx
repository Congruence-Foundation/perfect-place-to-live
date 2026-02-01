'use client';

import { getExtensionRegistry } from '@/extensions/registry';
// Import init to ensure extensions are registered
import '@/extensions/init';

/**
 * ExtensionControllers - Renders all extension controller components
 * 
 * This component iterates through all registered extensions and renders
 * their Controller components. Controllers handle side effects like:
 * - Fetching data when map bounds change
 * - Rendering markers on the map
 * - Subscribing to store changes
 * 
 * Controllers return null (no UI) - they're purely for side effects.
 * This keeps extensions fully self-contained and decoupled from the core.
 */
export function ExtensionControllers() {
  const registry = getExtensionRegistry();
  const extensions = registry.getAll();
  
  return (
    <>
      {extensions.map((extension) => {
        const Controller = extension.Controller;
        if (!Controller) return null;
        return <Controller key={extension.id} />;
      })}
    </>
  );
}

export default ExtensionControllers;
