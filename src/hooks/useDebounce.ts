'use client';

import { useState, useEffect } from 'react';

/**
 * Debounce a value
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (clamped to non-negative)
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Clamp delay to non-negative to prevent issues with negative timeouts
    const safeDelay = Math.max(0, delay);
    
    // If delay is 0, update immediately
    if (safeDelay === 0) {
      setDebouncedValue(value);
      return;
    }
    
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, safeDelay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
