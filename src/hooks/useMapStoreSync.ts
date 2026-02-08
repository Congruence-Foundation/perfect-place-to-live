import { useEffect, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { usePreferencesHydrated } from '@/stores/preferencesStore';
import type { Bounds, HeatmapPoint, Factor, HeatmapSettings } from '@/types';

interface UseMapStoreSyncOptions {
  debouncedBounds: Bounds | null;
  zoomLevel: number;
  heatmapPoints: HeatmapPoint[];
  heatmapSettings: HeatmapSettings;
  debouncedFactors: Factor[];
}

/**
 * Synchronizes local state with the map store.
 * Uses refs to prevent unnecessary updates and avoid infinite loops.
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

  const prevContextRef = useRef<string>('');
  const prevHeatmapRef = useRef<HeatmapPoint[]>([]);
  const prevSettingsRef = useRef<string>('');
  const prevFactorsRef = useRef<Factor[]>([]);

  // Sync bounds/zoom
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

  // Sync heatmap points
  useEffect(() => {
    if (heatmapPoints !== prevHeatmapRef.current) {
      prevHeatmapRef.current = heatmapPoints;
      setMapContext({ heatmapPoints });
    }
  }, [heatmapPoints, setMapContext]);

  // Sync heatmap settings
  useEffect(() => {
    const settingsSubset = {
      gridCellSize: heatmapSettings.gridCellSize,
      clusterPriceDisplay: heatmapSettings.clusterPriceDisplay,
      clusterPriceAnalysis: heatmapSettings.clusterPriceAnalysis,
      detailedModeThreshold: heatmapSettings.detailedModeThreshold,
    };
    const settingsKey = JSON.stringify(settingsSubset);
    if (settingsKey !== prevSettingsRef.current) {
      prevSettingsRef.current = settingsKey;
      setMapContext(settingsSubset);
    }
  }, [
    heatmapSettings.gridCellSize,
    heatmapSettings.clusterPriceDisplay,
    heatmapSettings.clusterPriceAnalysis,
    heatmapSettings.detailedModeThreshold,
    setMapContext,
  ]);

  // Sync factors (wait for preferences store to hydrate first)
  useEffect(() => {
    if (!preferencesHydrated) return;
    
    if (debouncedFactors !== prevFactorsRef.current) {
      prevFactorsRef.current = debouncedFactors;
      setMapContext({ factors: debouncedFactors });
    }
  }, [debouncedFactors, setMapContext, preferencesHydrated]);
}
