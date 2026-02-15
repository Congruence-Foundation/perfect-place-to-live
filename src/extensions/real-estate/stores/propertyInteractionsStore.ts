'use client';

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

import type { UnifiedEstateType, UnifiedProperty } from '../lib/shared/types';

/**
 * Minimal property data stored for liked properties
 * This allows rendering liked markers even when the property is outside the viewport
 */
export interface LikedPropertyData {
  id: string;
  lat: number;
  lng: number;
  estateType: UnifiedEstateType;
  price: number | null;
  pricePerMeter: number | null;
  area: number;
  rooms: number | null;
  title: string;
  url: string;
  /** Data source (otodom, gratka) */
  source: string;
  /** First image URL for popup display */
  imageUrl: string | null;
}

/**
 * Create LikedPropertyData from a UnifiedProperty
 */
export function toLikedPropertyData(property: UnifiedProperty): LikedPropertyData {
  return {
    id: property.id,
    lat: property.lat,
    lng: property.lng,
    estateType: property.estateType,
    price: property.price,
    pricePerMeter: property.pricePerMeter,
    area: property.area,
    rooms: property.rooms,
    title: property.title,
    url: property.url,
    source: property.source,
    imageUrl: property.images.length > 0 ? property.images[0].medium : null,
  };
}

/**
 * Property interactions store state
 */
export interface PropertyInteractionsState {
  /** Visited property IDs (stored as array for JSON serialization) */
  visitedIds: string[];
  /** Fast lookup Set for visited IDs (derived from visitedIds, not persisted) */
  _visitedSet: Set<string>;
  /** Map of liked properties with minimal data for rendering */
  likedProperties: Record<string, LikedPropertyData>;
  
  /** Hydration tracking */
  _hasHydrated: boolean;
}

/**
 * Property interactions store actions
 */
export interface PropertyInteractionsActions {
  /** Mark a property as visited */
  markVisited: (id: string) => void;
  /** Toggle like status for a property */
  toggleLike: (id: string, propertyData?: LikedPropertyData) => void;
  /** Check if a property has been visited */
  isVisited: (id: string) => boolean;
  /** Check if a property is liked */
  isLiked: (id: string) => boolean;
  /** Clear all visited properties */
  clearVisited: () => void;
  /** Clear all liked properties */
  clearLiked: () => void;
  /** Hydration action */
  setHasHydrated: (hasHydrated: boolean) => void;
}

/**
 * Combined store type
 */
export type PropertyInteractionsStore = PropertyInteractionsState & PropertyInteractionsActions;

/**
 * Default initial state
 */
const initialState: PropertyInteractionsState = {
  visitedIds: [],
  _visitedSet: new Set(),
  likedProperties: {},
  _hasHydrated: false,
};

/**
 * Property interactions store using Zustand
 * 
 * This store tracks user interactions with properties:
 * - Visited: Properties that have been clicked (shown with faded appearance)
 * - Liked: Properties that user has favorited (shown with pink border, always visible)
 * 
 * Both are persisted to localStorage for persistence across sessions.
 */
export const usePropertyInteractionsStore = create<PropertyInteractionsStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // Initial state
          ...initialState,
          
          // Mark a property as visited
          markVisited: (id) => {
            const { _visitedSet } = get();
            if (_visitedSet.has(id)) return; // Already visited (O(1) check)
            
            const newSet = new Set(_visitedSet);
            newSet.add(id);
            set(
              { visitedIds: [...get().visitedIds, id], _visitedSet: newSet },
              false,
              'markVisited'
            );
          },
          
          // Toggle like status
          toggleLike: (id, propertyData) => {
            const { likedProperties } = get();
            const isCurrentlyLiked = id in likedProperties;
            
            if (isCurrentlyLiked) {
              // Unlike: remove from liked
              const { [id]: _, ...rest } = likedProperties;
              set({ likedProperties: rest }, false, 'toggleLike:unlike');
            } else if (propertyData) {
              // Like: add to liked (only if we have property data)
              set(
                { likedProperties: { ...likedProperties, [id]: propertyData } },
                false,
                'toggleLike:like'
              );
            }
          },
          
          // Check if visited
          isVisited: (id) => {
            return get()._visitedSet.has(id);
          },
          
          // Check if liked
          isLiked: (id) => {
            return id in get().likedProperties;
          },
          
          // Clear all visited
          clearVisited: () => {
            set({ visitedIds: [], _visitedSet: new Set() }, false, 'clearVisited');
          },
          
          // Clear all liked
          clearLiked: () => {
            set({ likedProperties: {} }, false, 'clearLiked');
          },
          
          // Hydration action
          setHasHydrated: (hasHydrated) => {
            // Rebuild the visited Set from the persisted array
            const visitedIds = get().visitedIds;
            set(
              { _hasHydrated: hasHydrated, _visitedSet: new Set(visitedIds) },
              false,
              'setHasHydrated'
            );
          },
        }),
        {
          name: 'property-interactions',
          partialize: (state) => ({
            visitedIds: state.visitedIds,
            likedProperties: state.likedProperties,
          }),
          skipHydration: true, // Manual hydration for instant loading
          onRehydrateStorage: () => (state) => {
            state?.setHasHydrated(true);
          },
        }
      )
    ),
    { name: 'property-interactions-store' }
  )
);

/**
 * Non-reactive getters for use in event handlers
 * These avoid unnecessary re-renders when checking state in callbacks
 */
export const propertyInteractionsSelectors = {
  isVisited: (id: string) => usePropertyInteractionsStore.getState().isVisited(id),
  isLiked: (id: string) => usePropertyInteractionsStore.getState().isLiked(id),
  markVisited: (id: string) => usePropertyInteractionsStore.getState().markVisited(id),
  toggleLike: (id: string, data?: LikedPropertyData) => usePropertyInteractionsStore.getState().toggleLike(id, data),
  getLikedProperties: () => usePropertyInteractionsStore.getState().likedProperties,
};
