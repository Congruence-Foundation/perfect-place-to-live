import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Delay execution for a specified number of milliseconds */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

/** Format distance in meters to human-readable string (e.g., "500m", "1.5km") */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '-';
  if (meters === 0) return '0m';
  
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

/** Simple hash function (djb2). Returns a base36 encoded string. */
export function djb2Hash(str: string): string {
  if (!str) return '0';
  
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
