import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { UI_CONFIG } from '@/constants/performance';
import type { HeatmapSettings, DistanceCurve } from '@/types';

interface UseHeatmapSettingsOptions {
  /** Initial distance curve from parent */
  initialDistanceCurve: DistanceCurve;
  /** Initial sensitivity from parent */
  initialSensitivity: number;
  /** Initial normalize to viewport setting from parent */
  initialNormalizeToViewport: boolean;
  /** Callback to notify parent of heatmap-related settings changes */
  onSettingsChange: (settings: {
    distanceCurve?: DistanceCurve;
    sensitivity?: number;
    normalizeToViewport?: boolean;
  }) => void;
}

interface UseHeatmapSettingsReturn {
  heatmapSettings: HeatmapSettings;
  handleSettingsChange: (updates: Partial<HeatmapSettings>) => void;
}

/**
 * Hook to manage heatmap settings state and sync with parent component.
 * Handles local state while notifying parent of relevant changes.
 * 
 * @param options - Configuration options including initial values and change callback
 * @returns Object containing heatmap settings state and change handler
 */
export function useHeatmapSettings({
  initialDistanceCurve,
  initialSensitivity,
  initialNormalizeToViewport,
  onSettingsChange,
}: UseHeatmapSettingsOptions): UseHeatmapSettingsReturn {
  const [heatmapSettings, setHeatmapSettings] = useState<HeatmapSettings>({
    gridCellSize: UI_CONFIG.DEFAULT_GRID_CELL_SIZE,
    distanceCurve: initialDistanceCurve,
    sensitivity: initialSensitivity,
    normalizeToViewport: initialNormalizeToViewport,
    clusterPriceDisplay: 'median',
    clusterPriceAnalysis: 'simplified',
    detailedModeThreshold: UI_CONFIG.DEFAULT_DETAILED_MODE_THRESHOLD,
  });

  // Use ref to avoid re-creating handleSettingsChange when callback changes
  const onSettingsChangeRef = useRef(onSettingsChange);
  
  // Keep ref up to date (must be in effect to avoid updating during render)
  useLayoutEffect(() => {
    onSettingsChangeRef.current = onSettingsChange;
  });

  const handleSettingsChange = useCallback((updates: Partial<HeatmapSettings>) => {
    setHeatmapSettings((prev) => ({ ...prev, ...updates }));
    
    // Notify parent of heatmap-related settings changes
    if (
      updates.distanceCurve !== undefined ||
      updates.sensitivity !== undefined ||
      updates.normalizeToViewport !== undefined
    ) {
      onSettingsChangeRef.current({
        distanceCurve: updates.distanceCurve,
        sensitivity: updates.sensitivity,
        normalizeToViewport: updates.normalizeToViewport,
      });
    }
  }, []);

  return {
    heatmapSettings,
    handleSettingsChange,
  };
}
