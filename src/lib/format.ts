const ONE_MILLION = 1_000_000;
const ONE_THOUSAND = 1_000;
const DEFAULT_LOCALE = 'pl-PL';

/** Format price with suffix (e.g., "1.50 M PLN", "500 k PLN") */
export function formatPrice(price: number, currency: string = 'PLN'): string {
  if (!Number.isFinite(price) || price < 0) return `- ${currency}`;
  if (price === 0) return `0 ${currency}`;
  
  if (price >= ONE_MILLION) return `${(price / ONE_MILLION).toFixed(2)} M ${currency}`;
  if (price >= ONE_THOUSAND) return `${(price / ONE_THOUSAND).toFixed(0)} k ${currency}`;
  return `${Math.round(price)} ${currency}`;
}

/** Format price with locale-specific thousand separators (e.g., "1 500 000 PLN") */
export function formatPriceWithSeparators(price: number, currency: string = 'PLN'): string {
  if (!Number.isFinite(price) || price < 0) return `- ${currency}`;
  return `${price.toLocaleString(DEFAULT_LOCALE)} ${currency}`;
}

/** Format number with locale-specific thousand separators (e.g., "1 500 000") */
export function formatNumberWithSeparators(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString(DEFAULT_LOCALE);
}

/** Format price compactly for map markers (e.g., "1.5M", "500k", "999") */
export function formatCompactPrice(price: number): string {
  if (!Number.isFinite(price) || price < 0) return '-';
  if (price === 0) return '0';
  
  if (price >= ONE_MILLION) {
    const millions = price / ONE_MILLION;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (price >= ONE_THOUSAND) {
    const thousands = price / ONE_THOUSAND;
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(0)}k`;
  }
  return Math.round(price).toString();
}
