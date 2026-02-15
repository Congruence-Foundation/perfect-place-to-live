'use client';

import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useRealEstateStore } from '@/extensions/real-estate/store';
import { usePropertyInteractionsStore } from '@/extensions/real-estate/stores/propertyInteractionsStore';

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
    const interactionsHydrated = usePropertyInteractionsStore.persist.hasHydrated();
    
    if (prefsHydrated && realEstateHydrated && interactionsHydrated) {
      setIsHydrated(true);
      return;
    }

    // Track hydration status for all stores
    let hydratedCount = 0;
    const totalStores = 3;
    
    const checkAllHydrated = () => {
      hydratedCount++;
      if (hydratedCount >= totalStores) {
        setIsHydrated(true);
      }
    };

    // Set up listeners for hydration completion
    const unsubPrefs = usePreferencesStore.persist.onFinishHydration(checkAllHydrated);
    const unsubRealEstate = useRealEstateStore.persist.onFinishHydration(checkAllHydrated);
    const unsubInteractions = usePropertyInteractionsStore.persist.onFinishHydration(checkAllHydrated);

    // Trigger rehydration
    usePreferencesStore.persist.rehydrate();
    useRealEstateStore.persist.rehydrate();
    usePropertyInteractionsStore.persist.rehydrate();

    return () => {
      unsubPrefs();
      unsubRealEstate();
      unsubInteractions();
    };
  }, []);

  // Don't render children until hydration is complete
  // This prevents the flash of default values
  if (!isHydrated) {
    return null;
  }

  return <>{children}</>;
}
