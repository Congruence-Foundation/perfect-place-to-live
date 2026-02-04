'use client';

import { Notification } from '@/hooks/useNotification';
import { UI_CONFIG } from '@/constants/performance';
import { Z_INDEX } from '@/constants/z-index';

interface ToastProps {
  notification: Notification | null;
}

export function Toast({ notification }: ToastProps) {
  if (!notification) return null;

  const duration = notification.duration || UI_CONFIG.NOTIFICATION_DURATION_MS;

  return (
    <div 
      className="absolute top-[72px] left-0 right-0 flex justify-center pointer-events-none"
      style={{ zIndex: Z_INDEX.FLOATING_CONTROLS }}
      role="alert"
      aria-live="polite"
    >
      <div 
        key={notification.id}
        className="bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap pointer-events-auto flex items-center"
        style={{ 
          animation: `fadeInOut ${duration}ms ease-in-out forwards` 
        }}
      >
        <span className="text-[11px] text-muted-foreground leading-none">
          {notification.message}
        </span>
      </div>
    </div>
  );
}
