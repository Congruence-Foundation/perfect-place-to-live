'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { UI_CONFIG } from '@/constants/performance';

export interface Notification {
  id: string;
  message: string;
  duration?: number; // in ms
}

interface UseNotificationReturn {
  notification: Notification | null;
  showNotification: (message: string, duration?: number) => void;
  clearNotification: () => void;
}

export function useNotification(): UseNotificationReturn {
  const [notification, setNotification] = useState<Notification | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /** Cancel any pending auto-dismiss timer */
  const cancelTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearNotification = useCallback(() => {
    cancelTimer();
    setNotification(null);
  }, [cancelTimer]);

  const showNotification = useCallback((message: string, duration: number = UI_CONFIG.NOTIFICATION_DURATION_MS) => {
    cancelTimer();

    const id = Date.now().toString();
    setNotification({ id, message, duration });

    timerRef.current = setTimeout(() => {
      setNotification(null);
      timerRef.current = null;
    }, duration);
  }, [cancelTimer]);

  // Cleanup timer on unmount
  useEffect(() => cancelTimer, [cancelTimer]);

  return {
    notification,
    showNotification,
    clearNotification,
  };
}
