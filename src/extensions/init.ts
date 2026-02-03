/**
 * Extension initialization module.
 * 
 * Registers all available extensions with the global registry.
 * Import this module early in the application lifecycle to ensure
 * extensions are available when needed.
 * 
 * Note: ES modules are only executed once, so no idempotency check is needed.
 */

import { registerExtension } from './registry';
import { createRealEstateExtension } from './real-estate';

// Register extensions on module load
registerExtension(createRealEstateExtension());
