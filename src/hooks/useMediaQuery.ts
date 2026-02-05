'use client';

import { useState, useEffect } from 'react';

/** Tailwind md breakpoint - matches screens 768px and wider */
const MD_BREAKPOINT_QUERY = '(min-width: 768px)';

/**
 * Hook to detect if a media query matches
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @param defaultValue - Default value to use during SSR (default: false)
 * @returns Boolean indicating if the query matches
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    
    // Set initial value - this is a legitimate SSR hydration pattern
    // We use a default value during SSR and update to the actual value after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
 * @returns True if viewport is below 768px, false otherwise
 */
export function useIsMobile(): boolean {
  // Default to desktop (false) to prevent layout shift on desktop
  // Most users are on desktop, so this minimizes flash
  return !useMediaQuery(MD_BREAKPOINT_QUERY, true);
}
