'use client';

/**
 * Hook for managing Leaflet instance with lazy loading
 * Provides a cached reference to avoid repeated dynamic imports
 */

import { useRef, useCallback } from 'react';

/**
 * Hook that provides a cached Leaflet instance with lazy loading
 * 
 * @returns Object with getLeaflet function and leafletRef
 * 
 * @example
 * ```tsx
 * const { getLeaflet, leafletRef } = useLeaflet();
 * 
 * // In an async function:
 * const L = await getLeaflet();
 * const marker = L.marker([lat, lng]);
 * 
 * // Or access the cached ref directly (may be null if not loaded):
 * if (leafletRef.current) {
 *   const marker = leafletRef.current.marker([lat, lng]);
 * }
 * ```
 */
export function useLeaflet() {
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const loadingPromiseRef = useRef<Promise<typeof import('leaflet')> | null>(null);

  /**
   * Get the Leaflet instance, loading it if necessary
   * Returns cached instance if already loaded
   */
  const getLeaflet = useCallback(async (): Promise<typeof import('leaflet')> => {
    // Return cached instance if available
    if (leafletRef.current) {
      return leafletRef.current;
    }

    // If already loading, wait for that promise
    if (loadingPromiseRef.current) {
      return loadingPromiseRef.current;
    }

    // Start loading
    loadingPromiseRef.current = (async () => {
      const L = (await import('leaflet')).default;
      leafletRef.current = L;
      return L;
    })();

    return loadingPromiseRef.current;
  }, []);

  /**
   * Get the Leaflet instance synchronously (may be null if not loaded)
   */
  const getLeafletSync = useCallback((): typeof import('leaflet') | null => {
    return leafletRef.current;
  }, []);

  return {
    /** Async function to get Leaflet instance (loads if needed) */
    getLeaflet,
    /** Sync function to get Leaflet instance (returns null if not loaded) */
    getLeafletSync,
    /** Direct ref to Leaflet instance (may be null) */
    leafletRef,
  };
}
