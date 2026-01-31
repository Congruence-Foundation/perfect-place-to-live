'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface RangeInputProps {
  label: string;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  onMinChange: (value?: number) => void;
  onMaxChange: (value?: number) => void;
}

export default function RangeInput({
  label,
  unit,
  minValue,
  maxValue,
  minPlaceholder = 'Min',
  maxPlaceholder = 'Max',
  onMinChange,
  onMaxChange,
}: RangeInputProps) {
  const displayLabel = unit ? `${label} (${unit})` : label;

  return (
    <div className="space-y-2">
      <Label className="text-xs">{displayLabel}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder={minPlaceholder}
          value={minValue ?? ''}
          onChange={(e) => onMinChange(e.target.value ? Number(e.target.value) : undefined)}
          className="h-7 text-xs"
        />
        <span className="text-xs text-muted-foreground">-</span>
        <Input
          type="number"
          placeholder={maxPlaceholder}
          value={maxValue ?? ''}
          onChange={(e) => onMaxChange(e.target.value ? Number(e.target.value) : undefined)}
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}
