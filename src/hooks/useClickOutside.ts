import { useEffect, RefObject } from 'react';

/**
 * Hook that detects clicks outside of a referenced element
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
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callback]);
}
