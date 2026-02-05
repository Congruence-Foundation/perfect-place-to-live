'use client';

/**
 * Hook to keep a ref synchronized with a value
 * Useful for accessing the latest value in callbacks without re-creating them
 */

import { useRef } from 'react';

/**
 * Returns a ref that always contains the latest value
 * 
 * This is useful when you need to access the latest value of a prop or state
 * inside a callback without adding it to the dependency array (which would
 * cause the callback to be recreated).
 * 
 * Note: We update the ref synchronously during render (not in useEffect) to ensure
 * the ref always has the latest value, even if accessed during the same render cycle.
 * This is safe because we're only mutating a ref, not causing side effects.
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
  
  // Update synchronously during render to ensure the ref is always current
  // This avoids the stale-value-on-first-render issue that occurs with useEffect
  // This is a well-known pattern (useLatestRef) that intentionally updates refs during render
  // eslint-disable-next-line react-hooks/refs
  ref.current = value;
  
  return ref;
}
