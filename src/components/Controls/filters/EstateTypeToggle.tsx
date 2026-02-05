'use client';

import { Label } from '@/components/ui/label';
import { Building2, Home, LucideIcon } from 'lucide-react';
import { EstateType } from '@/extensions/real-estate/types';
import { getToggleButtonClasses } from './ToggleButtonGroup';

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

const ESTATE_BUTTON_SIZE = 'flex-1 gap-2 h-8 text-xs';

const ESTATE_OPTIONS: { value: EstateType; Icon: LucideIcon }[] = [
  { value: 'FLAT', Icon: Building2 },
  { value: 'HOUSE', Icon: Home },
];

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
  // Only FLAT and HOUSE are supported in this toggle
  const labelMap: Partial<Record<EstateType, string>> = {
    FLAT: flatLabel,
    HOUSE: houseLabel,
  };

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

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        {ESTATE_OPTIONS.map((option) => {
          const isSelected = selected.includes(option.value);
          const optionLabel = labelMap[option.value] ?? option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleToggle(option.value)}
              className={getToggleButtonClasses(isSelected, ESTATE_BUTTON_SIZE)}
              aria-pressed={isSelected}
              aria-label={optionLabel}
            >
              <option.Icon className="h-3.5 w-3.5" />
              {optionLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
