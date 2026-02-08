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
 * State is persisted to localStorage via the preferences store.
 */
export function useFactors(): UseFactorsReturn {
  const factors = usePreferencesStore((state) => state.factors);
  const selectedProfile = usePreferencesStore((state) => state.selectedProfile);
  const setFactors = usePreferencesStore((state) => state.setFactors);
  const setSelectedProfile = usePreferencesStore((state) => state.setSelectedProfile);
  const handleProfileSelect = usePreferencesStore((state) => state.selectProfile);
  const handleResetFactors = usePreferencesStore((state) => state.resetToDefault);

  const handleFactorChange = useCallback((factorId: string, updates: Partial<Factor>) => {
    const newFactors = factors.map((f) => 
      f.id === factorId ? { ...f, ...updates } : f
    );
    setFactors(newFactors);
    setSelectedProfile(null);
  }, [factors, setFactors, setSelectedProfile]);

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
