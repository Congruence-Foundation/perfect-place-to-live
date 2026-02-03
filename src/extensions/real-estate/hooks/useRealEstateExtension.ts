'use client';

import { useShallow } from 'zustand/react/shallow';
import type { PriceValueRange } from '../types';
import { useRealEstateStore } from '../store';
import type { DataSource } from '../config';

/**
 * Props returned by useRealEstateExtension hook for UI components
 */
export interface UseRealEstateExtensionReturn {
  // State
  enabled: boolean;
  filters: import('../types').PropertyFilters;
  scoreRange: [number, number];
  priceValueRange: PriceValueRange;
  dataSources: DataSource[];
  totalCount: number;
  isLoading: boolean;
  isBelowMinZoom: boolean;
  error: string | null;
  
  // Computed values for debug/settings
  propertyCount: number;
  clusterCount: number;
  
  // Actions
  setEnabled: (enabled: boolean) => void;
  setFilters: (filters: Partial<import('../types').PropertyFilters>) => void;
  setScoreRange: (range: [number, number]) => void;
  setPriceValueRange: (range: PriceValueRange) => void;
  setDataSources: (sources: DataSource[]) => void;
}

/**
 * Hook to use the Real Estate extension state.
 * 
 * This hook provides access to the real estate Zustand store.
 * All side effects (fetching, rendering markers) are handled by RealEstateController.
 * 
 * This hook is safe to call from multiple UI components without causing
 * infinite loops, as it contains no useEffect or other side effects.
 */
export function useRealEstateExtension(): UseRealEstateExtensionReturn {
  // Get state from Zustand store
  const {
    enabled,
    filters,
    scoreRange,
    priceValueRange,
    dataSources,
    totalCount,
    isLoading,
    isBelowMinZoom,
    error,
    properties,
    clusters,
    clusterPropertiesCache,
    setEnabled,
    setFilters,
    setScoreRange,
    setPriceValueRange,
    setDataSources,
  } = useRealEstateStore(
    useShallow((s) => ({
      enabled: s.enabled,
      filters: s.filters,
      scoreRange: s.scoreRange,
      priceValueRange: s.priceValueRange,
      dataSources: s.dataSources,
      totalCount: s.totalCount,
      isLoading: s.isLoading,
      isBelowMinZoom: s.isBelowMinZoom,
      error: s.error,
      properties: s.properties,
      clusters: s.clusters,
      clusterPropertiesCache: s.clusterPropertiesCache,
      setEnabled: s.setEnabled,
      setFilters: s.setFilters,
      setScoreRange: s.setScoreRange,
      setPriceValueRange: s.setPriceValueRange,
      setDataSources: s.setDataSources,
    }))
  );

  return {
    enabled,
    filters,
    scoreRange,
    priceValueRange,
    dataSources,
    totalCount,
    isLoading,
    isBelowMinZoom,
    error,
    propertyCount: properties.length,
    clusterCount: clusters.length,
    setEnabled,
    setFilters,
    setScoreRange,
    setPriceValueRange,
    setDataSources,
  };
}
