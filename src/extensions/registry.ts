import type { MapExtension, ExtensionRegistry } from './types';

/**
 * Create an extension registry for managing map extensions
 */
export function createExtensionRegistry(): ExtensionRegistry {
  const extensions = new Map<string, MapExtension>();

  return {
    register(extension: MapExtension) {
      if (extensions.has(extension.id)) {
        console.warn(`Extension "${extension.id}" is already registered. Replacing.`);
      }
      extensions.set(extension.id, extension);
    },

    getAll() {
      return Array.from(extensions.values());
    },
  };
}

// Singleton registry instance
let globalRegistry: ExtensionRegistry | null = null;

/**
 * Get the global extension registry
 */
export function getExtensionRegistry(): ExtensionRegistry {
  if (!globalRegistry) {
    globalRegistry = createExtensionRegistry();
  }
  return globalRegistry;
}

/**
 * Register an extension with the global registry
 */
export function registerExtension(extension: MapExtension): void {
  getExtensionRegistry().register(extension);
}
