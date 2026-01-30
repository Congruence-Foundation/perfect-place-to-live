'use client';

import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';
import { useState, useRef } from 'react';
import { useClickOutside } from '@/hooks';

const LOCALES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setIsOpen(false));

  const switchLocale = (newLocale: string) => {
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
    window.location.reload();
  };

  const currentLocale = LOCALES.find(l => l.code === locale);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-8 h-8 rounded-full shadow-lg transition-all ${
          isOpen
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/95 backdrop-blur-sm hover:bg-muted border'
        }`}
        title={currentLocale?.label || 'Language'}
      >
        <Globe className={`h-4 w-4 ${isOpen ? '' : 'text-muted-foreground'}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-background/95 backdrop-blur-sm rounded-xl shadow-lg border p-1 w-32 animate-in fade-in slide-in-from-top-2 duration-200 z-[1100]">
          {LOCALES.map((loc) => (
            <button
              key={loc.code}
              onClick={() => switchLocale(loc.code)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                locale === loc.code 
                  ? 'bg-muted font-medium' 
                  : 'hover:bg-muted'
              }`}
            >
              <span>{loc.flag}</span>
              <span>{loc.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
