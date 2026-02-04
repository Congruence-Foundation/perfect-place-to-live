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

  const clearNotification = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotification(null);
  }, []);

  const showNotification = useCallback((message: string, duration: number = UI_CONFIG.NOTIFICATION_DURATION_MS) => {
    // Clear any existing notification
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const id = Date.now().toString();
    setNotification({ id, message, duration });

    // Auto-dismiss after duration
    timerRef.current = setTimeout(() => {
      setNotification(null);
      timerRef.current = null;
    }, duration);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    notification,
    showNotification,
    clearNotification,
  };
}
