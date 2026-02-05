'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface RefreshButtonProps {
  isLoading: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onAbort: () => void;
  /** Reason for being disabled - shows different text */
  disabledReason?: 'tooLarge' | null;
  /** Analytics progress (0-100), null when not calculating */
  analyticsProgress?: number | null;
}

/**
 * Refresh/Abort button for heatmap calculation
 * Shows Stop button when loading, Refresh button otherwise
 */
export function RefreshButton({
  isLoading,
  disabled,
  onRefresh,
  onAbort,
  disabledReason,
  analyticsProgress,
}: RefreshButtonProps) {
  const tControls = useTranslations('controls');

  // Determine button text based on disabled reason
  const getButtonText = () => {
    if (disabled && disabledReason === 'tooLarge') {
      return tControls('zoomInFirst');
    }
    return tControls('refresh');
  };

  const showProgress = analyticsProgress !== null && analyticsProgress !== undefined;

  return (
    <div className="flex flex-col items-center">
      {/* Analytics progress bar - above button, fixed height to prevent layout shift */}
      <div className="h-2 flex items-end mb-1 w-[calc(100%-1.5rem)]">
        {showProgress && (
          <div className="w-full h-1 bg-muted/80 rounded-full overflow-hidden shadow-sm">
            <div 
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${analyticsProgress}%` }}
            />
          </div>
        )}
      </div>
      {isLoading ? (
        <Button
          variant="destructive"
          size="sm"
          className="shadow-lg rounded-full px-4 text-white"
          onClick={onAbort}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="ml-2">{tControls('calculating')}</span>
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className={`shadow-lg rounded-full px-4 bg-background/95 backdrop-blur-sm ${
            disabled ? 'opacity-50' : ''
          }`}
          onClick={onRefresh}
          disabled={disabled}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="ml-2">{getButtonText()}</span>
        </Button>
      )}
    </div>
  );
}
