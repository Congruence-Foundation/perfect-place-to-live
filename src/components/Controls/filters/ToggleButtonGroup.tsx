'use client';

import { Label } from '@/components/ui/label';

// Shared toggle button styles used across toggle components
const TOGGLE_BUTTON_BASE = 'flex items-center justify-center rounded border transition-colors';
const TOGGLE_BUTTON_SELECTED = 'bg-primary text-primary-foreground border-primary';
const TOGGLE_BUTTON_UNSELECTED = 'bg-background hover:bg-muted border-input';

export function getToggleButtonClasses(isSelected: boolean, sizeClasses: string): string {
  return `${TOGGLE_BUTTON_BASE} ${sizeClasses} ${isSelected ? TOGGLE_BUTTON_SELECTED : TOGGLE_BUTTON_UNSELECTED}`;
}

interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ToggleButtonGroupProps<T extends string> {
  label: string;
  options: ToggleOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  size?: 'sm' | 'md';
}

const SIZE_CLASSES = {
  sm: 'px-2 h-6 text-[10px]',
  md: 'w-8 h-7 text-xs',
} as const;

export default function ToggleButtonGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
  size = 'sm',
}: ToggleButtonGroupProps<T>) {
  const handleToggle = (value: T) => {
    const isSelected = selected.includes(value);
    const updated = isSelected
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(updated);
  };

  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleToggle(option.value)}
              className={getToggleButtonClasses(isSelected, sizeClasses)}
              aria-pressed={isSelected}
              aria-label={option.label}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
