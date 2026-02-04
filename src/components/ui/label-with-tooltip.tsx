'use client';

import { Label } from './label';
import { InfoTooltip } from './info-tooltip';
import { cn } from '@/lib/utils';

export interface LabelWithTooltipProps {
  /** The label text */
  label: string;
  /** Optional tooltip content */
  tooltip?: string;
  /** Additional class name for the container */
  className?: string;
  /** Label size variant */
  size?: 'xs' | 'sm';
  /** HTML for attribute for the label */
  htmlFor?: string;
}

const SIZE_CLASSES = {
  xs: 'text-xs',
  sm: 'text-sm',
} as const;

/**
 * A label component with an optional info tooltip
 * Commonly used in settings panels and filter controls
 */
export function LabelWithTooltip({
  label,
  tooltip,
  className,
  size = 'xs',
  htmlFor,
}: LabelWithTooltipProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Label className={SIZE_CLASSES[size]} htmlFor={htmlFor}>
        {label}
      </Label>
      {tooltip && (
        <InfoTooltip>
          <p className="text-xs">{tooltip}</p>
        </InfoTooltip>
      )}
    </div>
  );
}
