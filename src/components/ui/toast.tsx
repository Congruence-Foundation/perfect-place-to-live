'use client';

import { Notification } from '@/hooks/useNotification';

interface ToastProps {
  notification: Notification | null;
}

export function Toast({ notification }: ToastProps) {
  if (!notification) return null;

  return (
    <div className="absolute z-[1000] top-[72px] left-0 right-0 flex justify-center pointer-events-none">
      <div 
        key={notification.id}
        className="bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap pointer-events-auto flex items-center"
        style={{ 
          animation: `fadeInOut ${notification.duration || 3000}ms ease-in-out forwards` 
        }}
      >
        <span className="text-[11px] text-muted-foreground leading-none">
          {notification.message}
        </span>
      </div>
    </div>
  );
}
