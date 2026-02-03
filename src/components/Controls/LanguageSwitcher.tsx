'use client';

import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';
import { useState, useRef } from 'react';
import { useClickOutside } from '@/hooks';
import { TIME_CONSTANTS } from '@/constants/performance';
import { SUPPORTED_LOCALES, LOCALE_METADATA } from '@/i18n/routing';
import { PanelToggleButton } from './PanelToggleButton';
import { Z_INDEX } from '@/constants/z-index';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsOpen(false));

  const switchLocale = (newLocale: string) => {
    document.cookie = `locale=${newLocale};path=/;max-age=${TIME_CONSTANTS.LOCALE_COOKIE_MAX_AGE}`;
    window.location.reload();
  };

  const currentLocaleMetadata = LOCALE_METADATA[locale as typeof SUPPORTED_LOCALES[number]];

  return (
    <div ref={containerRef} className="relative">
      <PanelToggleButton
        Icon={Globe}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        title={currentLocaleMetadata?.label || 'Language'}
        size="sm"
      />
      
      {isOpen && (
        <div 
          className="absolute top-full right-0 mt-2 bg-background/95 backdrop-blur-sm rounded-xl shadow-lg border p-1 w-32 animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ zIndex: Z_INDEX.DROPDOWN }}
        >
          {SUPPORTED_LOCALES.map((localeCode) => {
            const metadata = LOCALE_METADATA[localeCode];
            return (
              <button
                key={localeCode}
                onClick={() => switchLocale(localeCode)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                  locale === localeCode 
                    ? 'bg-muted font-medium' 
                    : 'hover:bg-muted'
                }`}
              >
                <span>{metadata.flag}</span>
                <span>{metadata.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
