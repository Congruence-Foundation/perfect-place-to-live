'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Square, ZoomIn } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface RefreshButtonProps {
  isLoading: boolean;
  isZoomedOutTooMuch: boolean;
  showZoomWarning: boolean;
  disabled: boolean;
  onRefresh: () => void;
  onAbort: () => void;
}

/**
 * Refresh/Abort button with zoom warning
 * Used in both desktop and mobile layouts
 */
export function RefreshButton({
  isLoading,
  isZoomedOutTooMuch,
  showZoomWarning,
  disabled,
  onRefresh,
  onAbort,
}: RefreshButtonProps) {
  const tControls = useTranslations('controls');

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Zoom warning message */}
      {showZoomWarning && (
        <div className="bg-amber-500/90 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <ZoomIn className="h-3.5 w-3.5" />
          <span>{tControls('zoomIn')}</span>
        </div>
      )}
      {isLoading ? (
        <Button
          variant="destructive"
          size="sm"
          className="shadow-lg rounded-full px-4"
          onClick={onAbort}
        >
          <Square className="h-4 w-4 fill-current" />
          <span className="ml-2">{tControls('stop')}</span>
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className={`shadow-lg rounded-full px-4 bg-background/95 backdrop-blur-sm ${
            isZoomedOutTooMuch ? 'opacity-50' : ''
          }`}
          onClick={onRefresh}
          disabled={disabled}
        >
          {isZoomedOutTooMuch ? (
            <ZoomIn className="h-4 w-4" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">{tControls('refresh')}</span>
        </Button>
      )}
    </div>
  );
}
