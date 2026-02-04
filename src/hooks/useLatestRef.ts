'use client';

/**
 * Hook to keep a ref synchronized with a value
 * Useful for accessing the latest value in callbacks without re-creating them
 */

import { useRef, useEffect } from 'react';

/**
 * Returns a ref that always contains the latest value
 * 
 * This is useful when you need to access the latest value of a prop or state
 * inside a callback without adding it to the dependency array (which would
 * cause the callback to be recreated).
 * 
 * @param value - The value to keep in sync
 * @returns A ref object that always contains the latest value
 * 
 * @example
 * ```tsx
 * function MyComponent({ onSave }: { onSave: (data: string) => void }) {
 *   const onSaveRef = useLatestRef(onSave);
 *   
 *   const handleClick = useCallback(() => {
 *     // Always calls the latest onSave without needing it in deps
 *     onSaveRef.current('data');
 *   }, []); // No need to include onSave in deps
 *   
 *   return <button onClick={handleClick}>Save</button>;
 * }
 * ```
 */
export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef<T>(value);
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref;
}
