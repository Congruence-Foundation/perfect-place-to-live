'use client';

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import type { Factor } from '@/types';
import { applyProfile } from '@/config/factors';

/**
 * Preferences store state interface
 */
export interface PreferencesState {
  selectedProfile: string | null;
  factors: Factor[];
  
  // Hydration tracking
  _hasHydrated: boolean;
}

/**
 * Preferences store actions interface
 */
export interface PreferencesActions {
  setSelectedProfile: (profileId: string | null) => void;
  setFactors: (factors: Factor[]) => void;
  selectProfile: (profileId: string) => void;
  resetToDefault: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

/**
 * Combined store type
 */
export type PreferencesStore = PreferencesState & PreferencesActions;

/**
 * Default initial state
 */
const initialState: PreferencesState = {
  selectedProfile: 'balanced',
  factors: applyProfile('balanced'),
  _hasHydrated: false,
};

/**
 * Preferences store using Zustand with persist middleware
 * 
 * This store holds user preferences that should persist across page reloads:
 * - Selected profile ID
 * - Factor configurations (weights, enabled state, max distances)
 * 
 * Uses localStorage for persistence via Zustand's persist middleware.
 * Uses skipHydration to allow manual synchronous hydration before first render.
 */
export const usePreferencesStore = create<PreferencesStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set) => ({
          // Initial state
          ...initialState,
          
          // Actions
          setSelectedProfile: (selectedProfile) => set(
            { selectedProfile },
            false,
            'setSelectedProfile'
          ),
          
          setFactors: (factors) => set(
            { factors },
            false,
            'setFactors'
          ),
          
          selectProfile: (profileId) => set(
            {
              selectedProfile: profileId,
              factors: applyProfile(profileId),
            },
            false,
            'selectProfile'
          ),
          
          resetToDefault: () => set(
            {
              selectedProfile: 'balanced',
              factors: applyProfile('balanced'),
            },
            false,
            'resetToDefault'
          ),
          
          setHasHydrated: (hasHydrated) => set(
            { _hasHydrated: hasHydrated },
            false,
            'setHasHydrated'
          ),
        }),
        {
          name: 'map-preferences',
          partialize: (state) => ({
            selectedProfile: state.selectedProfile,
            factors: state.factors,
          }),
          skipHydration: true, // We'll hydrate manually for instant loading
          onRehydrateStorage: () => (state) => {
            // Called when hydration completes
            state?.setHasHydrated(true);
          },
        }
      )
    ),
    { name: 'preferences-store' }
  )
);

/**
 * Hook to check if the preferences store has hydrated from localStorage
 */
export const usePreferencesHydrated = () => 
  usePreferencesStore((state) => state._hasHydrated);
