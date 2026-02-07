'use client';

import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useRealEstateStore } from '@/extensions/real-estate/store';

/**
 * Component that handles store hydration from localStorage.
 * 
 * This component triggers rehydration on mount and renders children
 * only after all persisted stores have been hydrated. This prevents
 * the "flash" of default values that would otherwise occur.
 * 
 * Usage: Wrap your app content with this component.
 */
export function StoreHydration({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Check if already hydrated (e.g., from a previous mount)
    const prefsHydrated = usePreferencesStore.persist.hasHydrated();
    const realEstateHydrated = useRealEstateStore.persist.hasHydrated();
    
    if (prefsHydrated && realEstateHydrated) {
      setIsHydrated(true);
      return;
    }

    // Set up listeners for hydration completion
    const unsubPrefs = usePreferencesStore.persist.onFinishHydration(() => {
      if (useRealEstateStore.persist.hasHydrated()) {
        setIsHydrated(true);
      }
    });

    const unsubRealEstate = useRealEstateStore.persist.onFinishHydration(() => {
      if (usePreferencesStore.persist.hasHydrated()) {
        setIsHydrated(true);
      }
    });

    // Trigger rehydration
    usePreferencesStore.persist.rehydrate();
    useRealEstateStore.persist.rehydrate();

    return () => {
      unsubPrefs();
      unsubRealEstate();
    };
  }, []);

  // Don't render children until hydration is complete
  // This prevents the flash of default values
  if (!isHydrated) {
    return null;
  }

  return <>{children}</>;
}
