/**
 * Popup navigation utilities for cluster popups
 *
 * Handles navigation between properties and images in cluster popups.
 */

import type { EnrichedUnifiedProperty } from '../lib/shared';

// =============================================================================
// Types
// =============================================================================

/** Mutable index state for popup navigation */
export interface NavigationState {
  propertyIndex: number;
  imageIndex: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Attach a click handler to a navigation button
 */
function attachNavButtonHandler(
  elementId: string,
  canNavigate: () => boolean,
  onNavigate: () => void
): void {
  const btn = document.getElementById(elementId);
  if (!btn) return;

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canNavigate()) {
      onNavigate();
    }
  };
}

/**
 * Attach navigation event listeners to popup buttons
 *
 * @param clusterId - Unique cluster identifier for element IDs
 * @param state - Mutable navigation state object
 * @param fetchedCount - Total number of fetched properties
 * @param props - Array of enriched properties for the cluster
 * @param updatePopup - Callback to re-render the popup content
 */
export function attachPopupNavigationListeners(
  clusterId: string,
  state: NavigationState,
  fetchedCount: number,
  props: EnrichedUnifiedProperty[],
  updatePopup: () => void
): void {
  // Property navigation (prev/next)
  attachNavButtonHandler(
    `${clusterId}-prev`,
    () => state.propertyIndex > 0,
    () => {
      state.propertyIndex--;
      state.imageIndex = 0;
      updatePopup();
    }
  );

  attachNavButtonHandler(
    `${clusterId}-next`,
    () => state.propertyIndex < fetchedCount - 1,
    () => {
      state.propertyIndex++;
      state.imageIndex = 0;
      updatePopup();
    }
  );

  // Image navigation (prev/next)
  const currentProperty = props[state.propertyIndex];
  if (!currentProperty) return;

  attachNavButtonHandler(
    `${clusterId}-img-prev`,
    () => state.imageIndex > 0,
    () => {
      state.imageIndex--;
      updatePopup();
    }
  );

  attachNavButtonHandler(
    `${clusterId}-img-next`,
    () => state.imageIndex < currentProperty.images.length - 1,
    () => {
      state.imageIndex++;
      updatePopup();
    }
  );
}
