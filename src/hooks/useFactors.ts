import { useCallback, useMemo } from 'react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { Factor } from '@/types';

interface UseFactorsReturn {
  factors: Factor[];
  selectedProfile: string | null;
  enabledFactorCount: number;
  handleFactorChange: (factorId: string, updates: Partial<Factor>) => void;
  handleProfileSelect: (profileId: string) => void;
  handleResetFactors: () => void;
}

/**
 * Hook to manage factor state and profile selection.
 * Encapsulates all factor-related state and handlers.
 * 
 * State is persisted to localStorage via the preferences store,
 * so user selections survive page reloads.
 * 
 * @returns Object containing factors state, selected profile, and handler functions
 */
export function useFactors(): UseFactorsReturn {
  // Read state from persisted store
  const factors = usePreferencesStore((state) => state.factors);
  const selectedProfile = usePreferencesStore((state) => state.selectedProfile);
  
  // Get store actions
  const setFactors = usePreferencesStore((state) => state.setFactors);
  const setSelectedProfile = usePreferencesStore((state) => state.setSelectedProfile);
  const selectProfile = usePreferencesStore((state) => state.selectProfile);
  const resetToDefault = usePreferencesStore((state) => state.resetToDefault);

  const handleFactorChange = useCallback((factorId: string, updates: Partial<Factor>) => {
    const newFactors = factors.map((f) => 
      f.id === factorId ? { ...f, ...updates } : f
    );
    setFactors(newFactors);
    setSelectedProfile(null); // Custom changes clear the profile selection
  }, [factors, setFactors, setSelectedProfile]);

  const handleProfileSelect = useCallback((profileId: string) => {
    selectProfile(profileId);
  }, [selectProfile]);

  const handleResetFactors = useCallback(() => {
    resetToDefault();
  }, [resetToDefault]);

  const enabledFactorCount = useMemo(
    () => factors.filter((f) => f.enabled && f.weight !== 0).length,
    [factors]
  );

  return {
    factors,
    selectedProfile,
    enabledFactorCount,
    handleFactorChange,
    handleProfileSelect,
    handleResetFactors,
  };
}
