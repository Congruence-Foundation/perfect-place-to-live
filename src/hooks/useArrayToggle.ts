import { useCallback } from 'react';

/**
 * Generic hook for toggling values in an array
 * Useful for multi-select filters like rooms, floors, building types, etc.
 * 
 * @param currentValues - Current array of selected values (or undefined)
 * @param onChange - Callback to update the values (passes undefined when empty)
 * @returns Toggle function that adds/removes values from the array
 * 
 * @example
 * const toggleRoom = useArrayToggle(filters.roomsNumber, (rooms) => 
 *   onFiltersChange({ roomsNumber: rooms })
 * );
 * // Usage: toggleRoom('TWO', true) to add, toggleRoom('TWO', false) to remove
 */
export function useArrayToggle<T>(
  currentValues: T[] | undefined,
  onChange: (values: T[] | undefined) => void
) {
  return useCallback(
    (value: T, checked: boolean) => {
      const current = currentValues || [];
      const updated = checked
        ? [...current, value]
        : current.filter((v) => v !== value);
      onChange(updated.length > 0 ? updated : undefined);
    },
    [currentValues, onChange]
  );
}
