'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TogglePanelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** Icon component to display */
  icon: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md';
}

/**
 * Reusable toggle button for floating panels
 * Provides consistent styling for panel toggle buttons across the app
 */
export const TogglePanelButton = forwardRef<HTMLButtonElement, TogglePanelButtonProps>(
  ({ isOpen, icon, size = 'sm', className, ...props }, ref) => {
    const sizeClasses = {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'flex items-center justify-center rounded-full shadow-lg transition-all',
          sizeClasses[size],
          isOpen
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/95 backdrop-blur-sm hover:bg-muted border',
          className
        )}
        {...props}
      >
        <span className={cn(
          isOpen ? '' : 'text-muted-foreground',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
          '[&>svg]:h-full [&>svg]:w-full'
        )}>
          {icon}
        </span>
      </button>
    );
  }
);

TogglePanelButton.displayName = 'TogglePanelButton';
