'use client';

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { PriceValueRange } from '../types';
import type { ExtensionDebugSection, ExtensionSettingsSection } from '@/extensions/types';
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
  
  // Extension interface methods
  getDebugSections: () => ExtensionDebugSection[];
  getSettingsSections: () => ExtensionSettingsSection[];
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

  // Get debug sections for the debug panel - pure function
  const getDebugSections = useCallback((): ExtensionDebugSection[] => {
    if (!enabled) return [];
    
    return [{
      id: 'real-estate-debug',
      title: 'Real Estate',
      items: [
        {
          id: 'property-count',
          label: 'Properties',
          value: properties.length,
          showOnlyWhenEnabled: true,
        },
        {
          id: 'cluster-count',
          label: 'Clusters',
          value: clusters.length,
          showOnlyWhenEnabled: true,
        },
        {
          id: 'total-count',
          label: 'Total Available',
          value: totalCount,
          showOnlyWhenEnabled: true,
        },
        {
          id: 'cache-size',
          label: 'Cached Clusters',
          value: clusterPropertiesCache.size,
          showOnlyWhenEnabled: true,
        },
      ],
    }];
  }, [enabled, properties.length, clusters.length, totalCount, clusterPropertiesCache.size]);

  // Get settings sections for the settings panel - pure function
  const getSettingsSections = useCallback((): ExtensionSettingsSection[] => {
    if (!enabled) return [];
    
    return [{
      id: 'real-estate-settings',
      title: 'Real Estate',
      collapsible: true,
      defaultExpanded: true,
      items: [
        {
          id: 'score-range',
          label: 'Score Filter',
          tooltip: 'Filter properties by location quality score',
          type: 'custom',
          value: scoreRange,
          onChange: (value) => setScoreRange(value as [number, number]),
        },
        {
          id: 'price-value-range',
          label: 'Price Value Filter',
          tooltip: 'Filter properties by price value category',
          type: 'custom',
          value: priceValueRange,
          onChange: (value) => setPriceValueRange(value as PriceValueRange),
        },
      ],
    }];
  }, [enabled, scoreRange, priceValueRange, setScoreRange, setPriceValueRange]);

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
    getDebugSections,
    getSettingsSections,
  };
}
