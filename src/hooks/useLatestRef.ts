'use client';

import { useRef } from 'react';

/**
 * Returns a ref that always contains the latest value.
 * 
 * Useful for accessing the latest value of a prop or state inside a callback
 * without adding it to the dependency array (which would recreate the callback).
 * 
 * Updates synchronously during render to avoid stale-value-on-first-render issues.
 * 
 * @example
 * ```tsx
 * function MyComponent({ onSave }: { onSave: (data: string) => void }) {
 *   const onSaveRef = useLatestRef(onSave);
 *   
 *   const handleClick = useCallback(() => {
 *     onSaveRef.current('data');
 *   }, []);
 *   
 *   return <button onClick={handleClick}>Save</button>;
 * }
 * ```
 */
export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef<T>(value);
  
  // eslint-disable-next-line react-hooks/refs
  ref.current = value;
  
  return ref;
}
