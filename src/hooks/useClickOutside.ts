'use client';

import { useEffect, RefObject } from 'react';
import { useLatestRef } from './useLatestRef';

/**
 * Hook that detects clicks outside of a referenced element
 * 
 * Uses useLatestRef for the callback to avoid re-subscribing
 * to the event listener when the callback changes.
 * 
 * @param ref - React ref to the element to monitor
 * @param callback - Function to call when a click outside is detected
 * 
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 * useClickOutside(containerRef, () => setIsOpen(false));
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  callback: () => void
): void {
  // Use useLatestRef to keep callback up-to-date without re-subscribing
  const callbackRef = useLatestRef(callback);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callbackRef.current();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callbackRef]); // callbackRef is stable, so this won't cause re-subscriptions
}
