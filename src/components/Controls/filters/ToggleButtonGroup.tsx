'use client';

import { Label } from '@/components/ui/label';

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

  const sizeClasses = size === 'sm' 
    ? 'px-2 h-6 text-[10px]' 
    : 'w-8 h-7 text-xs';

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
              className={`flex items-center justify-center ${sizeClasses} rounded border cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted border-input'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
