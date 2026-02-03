'use client';

import { useEffect, useRef, RefObject } from 'react';

/**
 * Hook that detects clicks outside of a referenced element
 * 
 * Uses a ref pattern for the callback to avoid re-subscribing
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
  // Store callback in a ref to avoid re-subscribing on every render
  const callbackRef = useRef(callback);
  
  // Update the ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callbackRef.current();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref]); // Only ref in deps - callback is accessed via ref
}
