'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Square, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface RefreshButtonProps {
  isLoading: boolean;
  disabled: boolean;
  loadedTiles: number;
  totalTiles: number;
  onRefresh: () => void;
  onAbort: () => void;
}

/**
 * Refresh/Abort button for heatmap calculation
 * Shows Stop button when loading, Refresh button otherwise
 */
export function RefreshButton({
  isLoading,
  disabled,
  loadedTiles,
  totalTiles,
  onRefresh,
  onAbort,
}: RefreshButtonProps) {
  const tControls = useTranslations('controls');

  return (
    <div className="flex flex-col items-center gap-2">
      {isLoading ? (
        <Button
          variant="destructive"
          size="sm"
          className="shadow-lg rounded-full px-4"
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
          <span className="ml-2">{tControls('refresh')}</span>
        </Button>
      )}
    </div>
  );
}
