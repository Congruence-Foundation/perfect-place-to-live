'use client';

import { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CollapsibleFactorsSectionProps {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  enabledFactorCount: number;
  onReset: () => void;
  children: ReactNode;
}

/**
 * Reusable collapsible section for factors.
 * Used by both BottomSheet (mobile) and DesktopControlPanel.
 */
export function CollapsibleFactorsSection({
  isExpanded,
  onToggleExpanded,
  enabledFactorCount,
  onReset,
  children,
}: CollapsibleFactorsSectionProps) {
  const tControls = useTranslations('controls');

  return (
    <div className={`rounded-xl bg-muted/50 transition-colors ${isExpanded ? '' : 'hover:bg-muted'}`}>
      {/* Header - always visible */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={onToggleExpanded}
          className="flex items-center gap-3 flex-1"
          aria-expanded={isExpanded}
          aria-controls="factors-content"
        >
          <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shadow-sm">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium block">{tControls('factors')}</span>
            <span className="text-xs text-muted-foreground">
              {tControls('active', { count: enabledFactorCount })}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {isExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 px-2 text-xs animate-in fade-in slide-in-from-right-2 duration-200"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {tControls('reset')}
            </Button>
          )}
          <button
            onClick={onToggleExpanded}
            className="p-1 hover:bg-background/50 rounded transition-colors"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? tControls('collapse') : tControls('expand')}
          >
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div id="factors-content" className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-background/50 pt-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
