'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelToggleButtonProps {
  /** Icon to display */
  Icon: LucideIcon;
  /** Whether the panel is currently open */
  isOpen: boolean;
  /** Click handler */
  onClick: () => void;
  /** Accessible title/tooltip */
  title?: string;
  /** Whether to show error state */
  hasError?: boolean;
  /** Alternative icon to show when there's an error and panel is closed */
  ErrorIcon?: LucideIcon;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional className */
  className?: string;
}

/**
 * Reusable toggle button for floating panels.
 * Used by AppInfo, DebugInfo, MapSettings, LanguageSwitcher, etc.
 */
export function PanelToggleButton({
  Icon,
  isOpen,
  onClick,
  title,
  hasError = false,
  ErrorIcon,
  size = 'md',
  className,
}: PanelToggleButtonProps) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconSizeClasses = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const showErrorIcon = hasError && !isOpen && ErrorIcon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-full shadow-lg transition-all',
        sizeClasses,
        isOpen
          ? 'bg-primary text-primary-foreground'
          : hasError
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-background/95 backdrop-blur-sm hover:bg-muted border',
        className
      )}
      title={title}
      aria-expanded={isOpen}
      aria-label={title}
    >
      {showErrorIcon ? (
        <ErrorIcon className={iconSizeClasses} />
      ) : (
        <Icon className={cn(iconSizeClasses, !isOpen && !hasError && 'text-muted-foreground')} />
      )}
    </button>
  );
}
