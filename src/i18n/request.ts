import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// Import messages statically
import en from '../messages/en.json';
import pl from '../messages/pl.json';

const messages = {
  en,
  pl,
} as const;

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get('locale')?.value?.trim() || undefined;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale as keyof typeof messages],
  };
});
