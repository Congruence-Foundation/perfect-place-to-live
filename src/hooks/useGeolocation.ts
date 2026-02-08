import { useEffect, useRef } from 'react';
import { UI_CONFIG } from '@/constants/performance';
import { useLatestRef } from './useLatestRef';

interface GeolocationOptions {
  /** Callback when position is successfully obtained */
  onSuccess: (latitude: number, longitude: number) => void;
  /** Optional callback when geolocation fails or is denied */
  onError?: () => void;
  /** Whether geolocation should be enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook to request user's geolocation on mount.
 * Only attempts geolocation once per component lifecycle.
 */
export function useGeolocation({
  onSuccess,
  onError,
  enabled = true,
}: GeolocationOptions): void {
  const attemptedRef = useRef(false);
  const onSuccessRef = useLatestRef(onSuccess);
  const onErrorRef = useLatestRef(onError);

  useEffect(() => {
    if (!enabled || attemptedRef.current) return;
    attemptedRef.current = true;

    if (!('geolocation' in navigator)) {
      onErrorRef.current?.();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onSuccessRef.current(latitude, longitude);
      },
      () => {
        onErrorRef.current?.();
      },
      {
        enableHighAccuracy: false,
        timeout: UI_CONFIG.GEOLOCATION_TIMEOUT_MS,
        maximumAge: UI_CONFIG.GEOLOCATION_MAX_AGE_MS,
      }
    );
  }, [enabled]);
}
