/**
 * Extension initialization module.
 * 
 * Registers all available extensions with the global registry.
 * Import this module early in the application lifecycle to ensure
 * extensions are available when needed.
 */

import { registerExtension } from './registry';
import { createRealEstateExtension } from './real-estate';

let initialized = false;

/**
 * Initialize all extensions by registering them with the global registry.
 * This function is idempotent - calling it multiple times has no effect.
 * Internal function - auto-called on module import
 */
function initializeExtensions(): void {
  if (initialized) {
    return;
  }
  
  registerExtension(createRealEstateExtension());
  
  initialized = true;
}

// Auto-initialize when this module is imported
initializeExtensions();
