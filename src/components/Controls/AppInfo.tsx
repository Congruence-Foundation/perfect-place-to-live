'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, X } from 'lucide-react';

export default function AppInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('help');

  return (
    <div className="relative">
      {/* Expanded Panel */}
      {isOpen && (
        <div className="absolute top-10 right-0 z-[1000] bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4 w-64 animate-in fade-in slide-in-from-top-2 duration-200">
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

          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-foreground font-medium">•</span>
              <span dangerouslySetInnerHTML={{ __html: t.raw('rightClick') }} />
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium">•</span>
              <span>{t('search')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium">•</span>
              <span>{t('adjust')}</span>
            </li>
            <li className="flex gap-2">
              <span className="text-foreground font-medium">•</span>
              <span>{t('greenAreas')}</span>
            </li>
          </ul>
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
