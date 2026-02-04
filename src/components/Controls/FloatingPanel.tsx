'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Z_INDEX } from '@/constants/z-index';

type PanelPosition = 
  | 'top-right' 
  | 'top-left' 
  | 'bottom-right' 
  | 'bottom-left'
  | 'dropdown-right'
  | 'dropdown-left';

interface FloatingPanelProps {
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** Panel content */
  children: ReactNode;
  /** Position relative to the toggle button */
  position?: PanelPosition;
  /** Width class (e.g., 'w-64', 'w-56') */
  width?: string;
  /** Additional className for the panel */
  className?: string;
  /** Whether to enable scrolling for mobile */
  mobileScrollable?: boolean;
}

const POSITION_CLASSES: Record<PanelPosition, string> = {
  'top-right': 'top-10 right-0',
  'top-left': 'top-10 left-0',
  'bottom-right': 'bottom-12 right-0',
  'bottom-left': 'bottom-12 left-0',
  'dropdown-right': 'top-full right-0 mt-2',
  'dropdown-left': 'top-full left-0 mt-2',
};

const ANIMATION_CLASSES: Record<PanelPosition, string> = {
  'top-right': 'animate-in fade-in slide-in-from-top-2',
  'top-left': 'animate-in fade-in slide-in-from-top-2',
  'bottom-right': 'animate-in fade-in slide-in-from-bottom-2',
  'bottom-left': 'animate-in fade-in slide-in-from-bottom-2',
  'dropdown-right': 'animate-in fade-in slide-in-from-top-2',
  'dropdown-left': 'animate-in fade-in slide-in-from-top-2',
};

/**
 * Reusable floating panel component for settings, debug info, etc.
 * Provides consistent styling and positioning for all floating panels.
 */
export function FloatingPanel({
  isOpen,
  children,
  position = 'bottom-right',
  width = 'w-64',
  className,
  mobileScrollable = false,
}: FloatingPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'absolute bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4 duration-200',
        POSITION_CLASSES[position],
        ANIMATION_CLASSES[position],
        width,
        mobileScrollable && 'max-h-[50vh] overflow-y-auto',
        className
      )}
      style={{ zIndex: Z_INDEX.FLOATING_CONTROLS }}
    >
      {children}
    </div>
  );
}
