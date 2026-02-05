import { useEffect, useRef, useLayoutEffect } from 'react';
import { UI_CONFIG } from '@/constants/performance';

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
 * 
 * Note: Callbacks are captured in refs to avoid re-triggering the effect
 * when the consumer doesn't memoize them.
 */
export function useGeolocation({
  onSuccess,
  onError,
  enabled = true,
}: GeolocationOptions): void {
  const attemptedRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // Keep refs up to date (must be in effect to avoid updating during render)
  useLayoutEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

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
        // Geolocation not available or denied
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
