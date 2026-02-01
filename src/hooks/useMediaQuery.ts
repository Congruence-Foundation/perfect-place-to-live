'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to detect if a media query matches
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @param defaultValue - Default value to use during SSR (defaults to false)
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    // Set initial value
    setMatches(mediaQuery.matches);

    // Create event listener
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    mediaQuery.addEventListener('change', handler);

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

/**
 * Hook to detect if the viewport is mobile (below md breakpoint)
 * @returns boolean - true if mobile, false if desktop
 */
export function useIsMobile(): boolean {
  // Default to desktop (false) to prevent layout shift on desktop
  // Most users are on desktop, so this minimizes flash
  return !useMediaQuery('(min-width: 768px)', true);
}
