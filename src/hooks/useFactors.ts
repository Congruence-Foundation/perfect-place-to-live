import { useState, useCallback, useMemo } from 'react';
import { applyProfile } from '@/config/factors';
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
 * @returns Object containing factors state, selected profile, and handler functions
 */
export function useFactors(): UseFactorsReturn {
  const [factors, setFactors] = useState<Factor[]>(() => applyProfile('balanced'));
  const [selectedProfile, setSelectedProfile] = useState<string | null>('balanced');

  const handleFactorChange = useCallback((factorId: string, updates: Partial<Factor>) => {
    setFactors((prev) =>
      prev.map((f) => (f.id === factorId ? { ...f, ...updates } : f))
    );
    setSelectedProfile(null);
  }, []);

  const handleProfileSelect = useCallback((profileId: string) => {
    setSelectedProfile(profileId);
    setFactors(applyProfile(profileId));
  }, []);

  const handleResetFactors = useCallback(() => {
    setFactors(applyProfile('balanced'));
    setSelectedProfile('balanced');
  }, []);

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
