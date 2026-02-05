'use client';

import { renderExtensionComponents } from '@/extensions/utils';

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
  return renderExtensionComponents('Controller');
}
