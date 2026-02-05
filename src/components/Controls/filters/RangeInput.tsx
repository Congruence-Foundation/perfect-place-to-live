'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChangeEvent } from 'react';

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

/** Parse input value to number or undefined if empty */
function parseInputValue(e: ChangeEvent<HTMLInputElement>): number | undefined {
  return e.target.value ? Number(e.target.value) : undefined;
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
  const minAriaLabel = `${minPlaceholder} ${label}${unit ? ` in ${unit}` : ''}`;
  const maxAriaLabel = `${maxPlaceholder} ${label}${unit ? ` in ${unit}` : ''}`;

  return (
    <div className="space-y-2">
      <Label className="text-xs">{displayLabel}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder={minPlaceholder}
          value={minValue ?? ''}
          onChange={(e) => onMinChange(parseInputValue(e))}
          className="h-7 text-xs"
          aria-label={minAriaLabel}
        />
        <span className="text-xs text-muted-foreground" aria-hidden="true">-</span>
        <Input
          type="number"
          placeholder={maxPlaceholder}
          value={maxValue ?? ''}
          onChange={(e) => onMaxChange(parseInputValue(e))}
          className="h-7 text-xs"
          aria-label={maxAriaLabel}
        />
      </div>
    </div>
  );
}
