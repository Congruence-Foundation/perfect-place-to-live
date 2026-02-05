'use client';

import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { useClickOutside } from '@/hooks';
import { TIME_CONSTANTS } from '@/constants/performance';
import { SUPPORTED_LOCALES, LOCALE_METADATA } from '@/i18n/routing';
import { PanelToggleButton } from './PanelToggleButton';
import { FloatingPanel } from './FloatingPanel';

/** Sets a cookie and reloads the page to apply the new locale */
function setLocaleCookie(newLocale: string): void {
  document.cookie = `locale=${newLocale};path=/;max-age=${TIME_CONSTANTS.LOCALE_COOKIE_MAX_AGE}`;
  window.location.reload();
}

export default function LanguageSwitcher() {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsOpen(false));

  const switchLocale = useCallback((newLocale: string) => {
    setLocaleCookie(newLocale);
  }, []);

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
      
      <FloatingPanel
        isOpen={isOpen}
        position="dropdown-right"
        width="w-32"
        className="p-1"
        ariaLabel="Language selection"
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
              aria-pressed={locale === localeCode}
              aria-label={`Switch to ${metadata.label}`}
            >
              <span aria-hidden="true">{metadata.flag}</span>
              <span>{metadata.label}</span>
            </button>
          );
        })}
      </FloatingPanel>
    </div>
  );
}
