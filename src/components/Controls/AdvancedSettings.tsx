'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { DistanceCurve } from '@/types';

export interface HeatmapSettings {
  gridCellSize: number; // in meters (25-300)
  distanceCurve: DistanceCurve; // distance scoring function
  sensitivity: number; // curve steepness (0.5-3, default 1)
  normalizeToViewport: boolean; // normalize K values to viewport range
}

interface AdvancedSettingsProps {
  mode: 'realtime' | 'precomputed';
  onModeChange: (mode: 'realtime' | 'precomputed') => void;
  settings: HeatmapSettings;
  onSettingsChange: (settings: Partial<HeatmapSettings>) => void;
}

export default function AdvancedSettings({
  mode,
  onModeChange,
  settings,
  onSettingsChange,
}: AdvancedSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="space-y-3">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Advanced Settings</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4 pt-2 border-t">
          {/* Computation Mode */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Computation Mode</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="p-0.5 hover:bg-muted rounded transition-colors">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    <strong>Real-time:</strong> Calculates heatmap on-demand. Flexible weights but slower.
                    <br /><br />
                    <strong>Pre-computed:</strong> Uses cached tiles. Fast but fixed weights.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${mode === 'realtime' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                Real-time
              </span>
              <Switch
                checked={mode === 'precomputed'}
                onCheckedChange={(checked) => onModeChange(checked ? 'precomputed' : 'realtime')}
              />
              <span className={`text-xs ${mode === 'precomputed' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                Pre-computed
              </span>
            </div>
            {mode === 'precomputed' && (
              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                Pre-computed tiles not yet available. Using real-time mode.
              </p>
            )}
          </div>

          {/* Grid Resolution */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Grid Resolution</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="p-0.5 hover:bg-muted rounded transition-colors">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Distance between sample points. Smaller = more accurate but slower to compute.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-xs text-muted-foreground">
                {settings.gridCellSize}m
              </span>
            </div>
            <Slider
              value={[settings.gridCellSize]}
              onValueChange={([value]) => onSettingsChange({ gridCellSize: value })}
              min={25}
              max={300}
              step={25}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dense (25m)</span>
              <span>Fast (300m)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
