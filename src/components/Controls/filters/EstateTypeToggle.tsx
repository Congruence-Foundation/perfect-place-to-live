'use client';

import { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Building2, Home } from 'lucide-react';
import { EstateType } from '@/types/property';

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

  const options: { value: EstateType; label: string; icon: ReactNode }[] = [
    { value: 'FLAT', label: flatLabel, icon: <Building2 className="h-3.5 w-3.5" /> },
    { value: 'HOUSE', label: houseLabel, icon: <Home className="h-3.5 w-3.5" /> },
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
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
