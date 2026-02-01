/**
 * Extension initialization module.
 * 
 * This module registers all available extensions with the global registry.
 * Import this module early in the application lifecycle to ensure extensions
 * are available when needed.
 */

import { registerExtension } from './registry';
import { createRealEstateExtension } from './real-estate';

// Track if extensions have been initialized
let initialized = false;

/**
 * Initialize all extensions by registering them with the global registry.
 * This function is idempotent - calling it multiple times has no effect.
 */
export function initializeExtensions(): void {
  if (initialized) {
    return;
  }
  
  // Register Real Estate extension
  registerExtension(createRealEstateExtension());
  
  // Add more extensions here as they are created
  // registerExtension(createAnotherExtension());
  
  initialized = true;
}

/**
 * Auto-initialize extensions when this module is imported.
 * This ensures extensions are registered before any component tries to use them.
 */
initializeExtensions();
