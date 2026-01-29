'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Info, X } from 'lucide-react';

const STORAGE_KEY = 'location-finder-info-seen';

export default function AppInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
  const t = useTranslations('help');

  // Check localStorage on mount and open if first visit
  useEffect(() => {
    const hasSeenInfo = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenInfo) {
      setIsOpen(true);
    }
    setHasCheckedStorage(true);
  }, []);

  // Save to localStorage when user closes the panel
  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  // Don't render until we've checked localStorage to avoid flash
  if (!hasCheckedStorage) {
    return (
      <div className="relative">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full shadow-lg bg-background/95 backdrop-blur-sm border"
          disabled
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Expanded Panel */}
      {isOpen && (
        <div className="absolute top-10 right-0 z-[1000] bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4 w-64 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{t('title')}</span>
            <button
              onClick={handleClose}
              className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <ol className="space-y-2 text-xs text-muted-foreground list-none">
            <li className="flex gap-2">
              <span className="text-foreground font-semibold w-4 shrink-0">1.</span>
              <span>{t('step1')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-semibold w-4 shrink-0">2.</span>
              <span>{t('step2')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-semibold w-4 shrink-0">3.</span>
              <span dangerouslySetInnerHTML={{ __html: t.raw('step3') }} />
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-semibold w-4 shrink-0">4.</span>
              <span dangerouslySetInnerHTML={{ __html: t.raw('step4') }} />
            </li>
          </ol>
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 shrink-0"></span>
            <span>{t('tip')}</span>
          </div>
        </div>
      )}

      {/* Toggle Button - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-8 h-8 rounded-full shadow-lg transition-colors ${
          isOpen
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/95 backdrop-blur-sm hover:bg-muted border'
        }`}
        title={t('title')}
      >
        <Info className={`h-4 w-4 ${isOpen ? '' : 'text-muted-foreground'}`} />
      </button>
    </div>
  );
}
