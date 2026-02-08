import { useState, useCallback } from 'react';
import { UI_CONFIG, POWER_MEAN_CONFIG } from '@/constants/performance';
import { useLatestRef } from './useLatestRef';
import type { HeatmapSettings, DistanceCurve } from '@/types';

interface UseHeatmapSettingsOptions {
  initialDistanceCurve: DistanceCurve;
  initialSensitivity: number;
  initialLambda?: number;
  initialNormalizeToViewport: boolean;
  /** Callback to notify parent of heatmap-related settings changes */
  onSettingsChange: (settings: {
    distanceCurve?: DistanceCurve;
    sensitivity?: number;
    lambda?: number;
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
 */
export function useHeatmapSettings({
  initialDistanceCurve,
  initialSensitivity,
  initialLambda = POWER_MEAN_CONFIG.DEFAULT_LAMBDA,
  initialNormalizeToViewport,
  onSettingsChange,
}: UseHeatmapSettingsOptions): UseHeatmapSettingsReturn {
  const [heatmapSettings, setHeatmapSettings] = useState<HeatmapSettings>({
    gridCellSize: UI_CONFIG.DEFAULT_GRID_CELL_SIZE,
    distanceCurve: initialDistanceCurve,
    sensitivity: initialSensitivity,
    lambda: initialLambda,
    normalizeToViewport: initialNormalizeToViewport,
    clusterPriceDisplay: 'median',
    clusterPriceAnalysis: 'simplified',
    detailedModeThreshold: UI_CONFIG.DEFAULT_DETAILED_MODE_THRESHOLD,
  });

  const onSettingsChangeRef = useLatestRef(onSettingsChange);

  const handleSettingsChange = useCallback((updates: Partial<HeatmapSettings>) => {
    setHeatmapSettings((prev) => ({ ...prev, ...updates }));
    
    if (
      updates.distanceCurve !== undefined ||
      updates.sensitivity !== undefined ||
      updates.lambda !== undefined ||
      updates.normalizeToViewport !== undefined
    ) {
      onSettingsChangeRef.current({
        distanceCurve: updates.distanceCurve,
        sensitivity: updates.sensitivity,
        lambda: updates.lambda,
        normalizeToViewport: updates.normalizeToViewport,
      });
    }
  }, [onSettingsChangeRef]);

  return {
    heatmapSettings,
    handleSettingsChange,
  };
}
