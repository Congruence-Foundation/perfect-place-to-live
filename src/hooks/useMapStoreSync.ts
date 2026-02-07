import { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePreferencesHydrated } from '@/stores/preferencesStore';
import type { Bounds, HeatmapPoint, Factor, HeatmapSettings } from '@/types';

interface UseMapStoreSyncOptions {
  /** Debounced bounds for map context */
  debouncedBounds: Bounds | null;
  /** Current zoom level */
  zoomLevel: number;
  /** Heatmap points to sync */
  heatmapPoints: HeatmapPoint[];
  /** Heatmap settings to sync */
  heatmapSettings: HeatmapSettings;
  /** Debounced factors to sync */
  debouncedFactors: Factor[];
}

/**
 * Hook to synchronize local state with the map store.
 * Uses refs to prevent unnecessary updates and avoid infinite loops.
 * 
 * @param options - State values to sync with the map store
 */
export function useMapStoreSync({
  debouncedBounds,
  zoomLevel,
  heatmapPoints,
  heatmapSettings,
  debouncedFactors,
}: UseMapStoreSyncOptions): void {
  const setMapContext = useMapStore((s) => s.setMapContext);
  const preferencesHydrated = usePreferencesHydrated();

  // Track previous values to avoid unnecessary updates
  const prevContextRef = useRef<string>('');
  const prevHeatmapRef = useRef<HeatmapPoint[]>([]);
  const prevSettingsRef = useRef<string>('');
  const prevFactorsRef = useRef<Factor[]>([]);

  // Update map store when bounds/zoom change
  useEffect(() => {
    const contextKey = JSON.stringify({
      bounds: debouncedBounds,
      zoom: zoomLevel,
    });
    if (contextKey !== prevContextRef.current) {
      prevContextRef.current = contextKey;
      setMapContext({ bounds: debouncedBounds, zoom: zoomLevel });
    }
  }, [debouncedBounds, zoomLevel, setMapContext]);

  // Update map store when heatmap data changes
  useEffect(() => {
    if (heatmapPoints !== prevHeatmapRef.current) {
      prevHeatmapRef.current = heatmapPoints;
      setMapContext({ heatmapPoints });
    }
  }, [heatmapPoints, setMapContext]);

  // Update map store when settings change
  useEffect(() => {
    const settingsKey = JSON.stringify({
      gridCellSize: heatmapSettings.gridCellSize,
      clusterPriceDisplay: heatmapSettings.clusterPriceDisplay,
      clusterPriceAnalysis: heatmapSettings.clusterPriceAnalysis,
      detailedModeThreshold: heatmapSettings.detailedModeThreshold,
    });
    if (settingsKey !== prevSettingsRef.current) {
      prevSettingsRef.current = settingsKey;
      setMapContext({
        gridCellSize: heatmapSettings.gridCellSize,
        clusterPriceDisplay: heatmapSettings.clusterPriceDisplay,
        clusterPriceAnalysis: heatmapSettings.clusterPriceAnalysis,
        detailedModeThreshold: heatmapSettings.detailedModeThreshold,
      });
    }
  }, [
    heatmapSettings.gridCellSize,
    heatmapSettings.clusterPriceDisplay,
    heatmapSettings.clusterPriceAnalysis,
    heatmapSettings.detailedModeThreshold,
    setMapContext,
  ]);

  // Update map store when factors change (reference equality check)
  // Wait for preferences store to hydrate before syncing factors
  useEffect(() => {
    if (!preferencesHydrated) return;
    
    if (debouncedFactors !== prevFactorsRef.current) {
      prevFactorsRef.current = debouncedFactors;
      setMapContext({ factors: debouncedFactors });
    }
  }, [debouncedFactors, setMapContext, preferencesHydrated]);
}
