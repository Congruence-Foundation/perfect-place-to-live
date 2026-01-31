/**
 * Format a price value with appropriate suffix (k, M) and currency
 * 
 * @param price - The price value to format
 * @param currency - Currency code (default: 'PLN')
 * @returns Formatted price string (e.g., "1.50 M PLN", "500 k PLN", "999 PLN")
 */
export function formatPrice(price: number, currency: string = 'PLN'): string {
  if (price >= 1000000) return `${(price / 1000000).toFixed(2)} M ${currency}`;
  if (price >= 1000) return `${(price / 1000).toFixed(0)} k ${currency}`;
  return `${price} ${currency}`;
}
