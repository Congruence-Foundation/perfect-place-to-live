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
  const cookieValue = store.get('locale')?.value;
  // Ensure we have a non-empty string before checking locale validity
  const requested = cookieValue && cookieValue.trim() ? cookieValue.trim() : undefined;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale as keyof typeof messages]
  };
});
