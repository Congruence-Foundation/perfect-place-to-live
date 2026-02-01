'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bug, X, AlertCircle } from 'lucide-react';

interface DebugInfoProps {
  enabledFactorCount: number;
  metadata: {
    pointCount: number;
    computeTimeMs: number;
  } | null;
  totalPOICount: number;
  error: string | null;
  isMobile?: boolean;
}

export default function DebugInfo({
  enabledFactorCount,
  metadata,
  totalPOICount,
  error,
  isMobile = false,
}: DebugInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('debug');

  return (
    <div className={`${
      isMobile ? 'relative' : 'absolute bottom-4 left-4'
    } z-[1000]`}>
      {/* Expanded Panel - Absolutely positioned above the button */}
      {isOpen && (
        <div className="absolute bottom-12 left-0 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4 w-48 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{t('title')}</span>
            <button
              onClick={() => setIsOpen(false)}
              className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('activeFactors')}</span>
              <span className="font-mono font-medium">{enabledFactorCount}</span>
            </div>
            {metadata && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('gridPoints')}</span>
                  <span className="font-mono font-medium">{metadata.pointCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('poisLoaded')}</span>
                  <span className="font-mono font-medium">{totalPOICount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('computeTime')}</span>
                  <span className="font-mono font-medium">{metadata.computeTimeMs}ms</span>
                </div>
              </>
            )}
            {error && (
              <div className="flex items-center gap-1.5 text-destructive mt-2 pt-2 border-t">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all ${
          isOpen 
            ? 'bg-primary text-primary-foreground' 
            : error 
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-background/95 backdrop-blur-sm hover:bg-muted border'
        }`}
        title={t('title')}
      >
        {error && !isOpen ? (
          <AlertCircle className="h-5 w-5" />
        ) : (
          <Bug className={`h-5 w-5 ${isOpen ? '' : 'text-muted-foreground'}`} />
        )}
      </button>
    </div>
  );
}
