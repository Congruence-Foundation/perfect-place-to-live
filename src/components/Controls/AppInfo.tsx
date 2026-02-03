'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { PanelHeader } from '@/components/ui/panel-header';

const STORAGE_KEY = 'location-finder-info-seen';

interface AppInfoProps {
  isMobile?: boolean;
}

export default function AppInfo({ isMobile = false }: AppInfoProps) {
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
        <div className={`absolute top-10 right-0 z-[1000] bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4 animate-in fade-in slide-in-from-top-2 duration-200 ${
          isMobile ? 'w-[calc(100vw-2rem)] max-w-72' : 'w-64'
        }`}>
          <PanelHeader title={t('title')} onClose={handleClose} />

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
