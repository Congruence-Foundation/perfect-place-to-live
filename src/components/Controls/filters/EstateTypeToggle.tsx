'use client';

import { Label } from '@/components/ui/label';
import { Building2, Home, LucideIcon } from 'lucide-react';
import { EstateType } from '@/extensions/real-estate/types';

interface EstateTypeToggleProps {
  label: string;
  selected: EstateType[];
  onChange: (selected: EstateType[]) => void;
  /** If true, at least one option must remain selected */
  requireOne?: boolean;
  /** Translated labels for FLAT and HOUSE */
  flatLabel: string;
  houseLabel: string;
}

/**
 * Multi-select toggle for estate types (FLAT/HOUSE)
 * Supports selecting one or both types
 */
export default function EstateTypeToggle({
  label,
  selected,
  onChange,
  requireOne = true,
  flatLabel,
  houseLabel,
}: EstateTypeToggleProps) {
  const handleToggle = (value: EstateType) => {
    const isSelected = selected.includes(value);
    
    // Don't allow deselecting the last one if requireOne is true
    if (requireOne && isSelected && selected.length === 1) {
      return;
    }
    
    const updated = isSelected
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    
    onChange(updated);
  };

  const options: { value: EstateType; label: string; Icon: LucideIcon }[] = [
    { value: 'FLAT', label: flatLabel, Icon: Building2 },
    { value: 'HOUSE', label: houseLabel, Icon: Home },
  ];

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleToggle(option.value)}
              className={`flex-1 flex items-center justify-center gap-2 h-8 rounded border text-xs transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input'
              }`}
              aria-pressed={isSelected}
              aria-label={option.label}
            >
              <option.Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
