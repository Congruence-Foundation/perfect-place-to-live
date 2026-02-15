/**
 * Popup navigation utilities for cluster popups
 *
 * Handles navigation between properties and images in cluster popups.
 */

import type { EnrichedUnifiedProperty } from '../lib/shared';
import {
  propertyInteractionsSelectors,
  toLikedPropertyData,
} from '../stores/propertyInteractionsStore';

// =============================================================================
// Types
// =============================================================================

/** Mutable index state for popup navigation */
export interface NavigationState {
  propertyIndex: number;
  imageIndex: number;
}

/** Callback type for when like state changes */
type OnLikeChangeCallback = (propertyId: string, isLiked: boolean) => void;

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
 * Set up global event delegation for like buttons
 * This handles clicks on any like button, even dynamically created ones
 * Uses mutable refs to avoid stale closures
 */
let globalLikeHandlerAttached = false;
let globalGetPropertyById: ((id: string) => EnrichedUnifiedProperty | undefined) | null = null;
let globalOnLikeChange: OnLikeChangeCallback | null = null;

export function setupGlobalLikeHandler(
  getPropertyById: (id: string) => EnrichedUnifiedProperty | undefined,
  onLikeChange: OnLikeChangeCallback
): void {
  // Always update the callbacks so they don't go stale
  globalGetPropertyById = getPropertyById;
  globalOnLikeChange = onLikeChange;
  
  if (globalLikeHandlerAttached) return;
  globalLikeHandlerAttached = true;
  
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('.property-like-btn') as HTMLButtonElement | null;
    if (!button) return;
    
    const propertyId = button.dataset.propertyId;
    if (!propertyId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (!globalGetPropertyById || !globalOnLikeChange) return;
    
    const property = globalGetPropertyById(propertyId);
    if (!property) return;
    
    const isCurrentlyLiked = button.dataset.liked === 'true';
    
    // Toggle like state in store
    propertyInteractionsSelectors.toggleLike(propertyId, toLikedPropertyData(property));
    
    const newIsLiked = !isCurrentlyLiked;
    globalOnLikeChange(propertyId, newIsLiked);
  });
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
