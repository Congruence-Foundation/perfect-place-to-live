'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type AnimationDirection = 'top' | 'bottom';
type Position = 'top-right' | 'bottom-right' | 'bottom-left';

interface FloatingPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Position relative to the trigger button */
  position?: Position;
  /** Animation direction for slide-in effect */
  animationDirection?: AnimationDirection;
  /** Width of the panel */
  width?: 'sm' | 'md' | 'lg' | 'auto';
  /** Whether to enable max-height scrolling (for mobile) */
  scrollable?: boolean;
}

/**
 * Reusable floating panel container
 * Provides consistent styling for dropdown panels across the app
 */
export const FloatingPanel = forwardRef<HTMLDivElement, FloatingPanelProps>(
  ({ 
    position = 'top-right',
    animationDirection = 'top',
    width = 'md',
    scrollable = false,
    className,
    children,
    ...props 
  }, ref) => {
    const positionClasses: Record<Position, string> = {
      'top-right': 'top-10 right-0',
      'bottom-right': 'bottom-12 right-0',
      'bottom-left': 'bottom-12 left-0',
    };

    const widthClasses: Record<string, string> = {
      sm: 'w-56',
      md: 'w-64',
      lg: 'w-72',
      auto: '',
    };

    const animationClasses: Record<AnimationDirection, string> = {
      top: 'animate-in fade-in slide-in-from-top-2 duration-200',
      bottom: 'animate-in fade-in slide-in-from-bottom-2 duration-200',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'absolute bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4',
          positionClasses[position],
          widthClasses[width],
          animationClasses[animationDirection],
          scrollable && 'max-h-[50vh] overflow-y-auto',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

FloatingPanel.displayName = 'FloatingPanel';
