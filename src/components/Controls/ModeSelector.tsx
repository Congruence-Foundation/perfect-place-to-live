'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface ModeSelectorProps {
  mode: 'realtime' | 'precomputed';
  onModeChange: (mode: 'realtime' | 'precomputed') => void;
  disabled?: boolean;
}

export default function ModeSelector({ mode, onModeChange, disabled }: ModeSelectorProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor="mode-switch" className="text-sm font-medium">
          Computation Mode
        </Label>
        <p className="text-xs text-muted-foreground">
          {mode === 'realtime'
            ? 'Real-time: Flexible weights, slower'
            : 'Pre-computed: Fast, fixed weights'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${mode === 'realtime' ? 'text-foreground' : 'text-muted-foreground'}`}>
          Real-time
        </span>
        <Switch
          id="mode-switch"
          checked={mode === 'precomputed'}
          onCheckedChange={(checked) => onModeChange(checked ? 'precomputed' : 'realtime')}
          disabled={disabled}
        />
        <span className={`text-xs ${mode === 'precomputed' ? 'text-foreground' : 'text-muted-foreground'}`}>
          Pre-computed
        </span>
      </div>
    </div>
  );
}
