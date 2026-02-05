import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Delay execution for a specified number of milliseconds
 * @param ms - Milliseconds to delay (clamped to non-negative)
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  // Clamp to non-negative value to prevent negative timeout issues
  const safeMs = Math.max(0, ms);
  return new Promise(resolve => setTimeout(resolve, safeMs));
}

/**
 * Format distance in meters to a human-readable string
 * @param meters - Distance in meters
 * @returns Formatted string (e.g., "500m" or "1.5km")
 */
export function formatDistance(meters: number): string {
  // Handle edge cases: NaN, Infinity, negative values
  if (!Number.isFinite(meters) || meters < 0) return '-';
  if (meters === 0) return '0m';
  
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

/**
 * Simple hash function (djb2 algorithm)
 * Used for generating cache keys and other hashing needs
 * 
 * @param str - String to hash
 * @returns Base36 encoded hash string
 */
export function djb2Hash(str: string): string {
  // Handle edge cases: empty string, null/undefined coerced to string
  if (!str || str.length === 0) return '0';
  
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
