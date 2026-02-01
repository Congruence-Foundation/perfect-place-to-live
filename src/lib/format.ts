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

/**
 * Format price compactly for map markers and labels (no currency, shorter format)
 * 
 * @param price - The price value to format
 * @returns Compact price string (e.g., "1.5M", "500k", "999")
 */
export function formatCompactPrice(price: number): string {
  if (price >= 1000000) {
    const millions = price / 1000000;
    return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
  }
  if (price >= 1000) {
    const thousands = price / 1000;
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(0)}k`;
  }
  return price.toString();
}

/**
 * Room count enum to display number mapping
 */
const ROOM_COUNT_MAP: Record<string, string> = {
  'ONE': '1',
  'TWO': '2',
  'THREE': '3',
  'FOUR': '4',
  'FIVE': '5',
  'SIX': '6',
  'SEVEN': '7',
  'EIGHT': '8',
  'NINE': '9',
  'TEN': '10',
  'MORE': '10+',
};

/**
 * Convert Otodom room count enum to display number
 * 
 * @param roomCount - Room count enum value (e.g., 'FOUR')
 * @returns Display string (e.g., '4')
 */
export function roomCountToNumber(roomCount: string): string {
  return ROOM_COUNT_MAP[roomCount] || roomCount;
}
