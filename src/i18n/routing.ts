import { defineRouting } from 'next-intl/routing';

/**
 * Supported locales for the application
 */
export const SUPPORTED_LOCALES = ['en', 'pl'] as const;

/**
 * Default locale for the application
 */
export const DEFAULT_LOCALE = 'en';

/**
 * Locale metadata for UI display
 */
export const LOCALE_METADATA: Record<typeof SUPPORTED_LOCALES[number], { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇬🇧' },
  pl: { label: 'Polski', flag: '🇵🇱' },
};

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed'
});
