import type { MapExtension, ExtensionState, ExtensionRegistry } from './types';

/**
 * Create an extension registry for managing map extensions
 */
export function createExtensionRegistry(): ExtensionRegistry {
  const extensions = new Map<string, MapExtension>();
  const states = new Map<string, ExtensionState>();

  return {
    register(extension: MapExtension) {
      if (extensions.has(extension.id)) {
        console.warn(`Extension "${extension.id}" is already registered. Replacing.`);
      }
      extensions.set(extension.id, extension);
      // Initialize state if not exists
      if (!states.has(extension.id)) {
        states.set(extension.id, { enabled: false });
      }
    },

    unregister(extensionId: string) {
      const extension = extensions.get(extensionId);
      if (extension?.onUnmount) {
        extension.onUnmount();
      }
      extensions.delete(extensionId);
      states.delete(extensionId);
    },

    getAll() {
      return Array.from(extensions.values());
    },

    get(extensionId: string) {
      return extensions.get(extensionId);
    },

    getState(extensionId: string) {
      return states.get(extensionId);
    },

    setState(extensionId: string, state: Partial<ExtensionState>) {
      const currentState = states.get(extensionId) || { enabled: false };
      states.set(extensionId, { ...currentState, ...state });
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
