'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelHeaderProps {
  /** Title text to display */
  title: string;
  /** Callback when close button is clicked */
  onClose: () => void;
  /** Optional additional className for the container */
  className?: string;
}

/**
 * PanelHeader Component
 * 
 * Reusable header for floating panels with a title and close button.
 * Used in AppInfo, DebugInfo, MapSettings, and other floating panels.
 */
export function PanelHeader({ title, onClose, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-3', className)}>
      <span className="text-sm font-semibold">{title}</span>
      <button
        onClick={onClose}
        className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
