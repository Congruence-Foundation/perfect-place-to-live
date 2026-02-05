'use client';

import { useState, useEffect } from 'react';

/**
 * Debounce a value, returning the debounced version after the specified delay
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (clamped to non-negative)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Clamp delay to non-negative to prevent issues with negative timeouts
    const safeDelay = Math.max(0, delay);
    
    // If delay is 0, update immediately
    // This is a legitimate pattern - we want synchronous updates when delay is 0
    if (safeDelay === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
