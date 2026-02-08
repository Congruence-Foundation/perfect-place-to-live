'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { UI_CONFIG } from '@/constants/performance';

interface SnapPointConfig {
  collapsedPercent: number;
  halfPercent: number;
  expandedPercent: number;
}

type SnapPointName = 'collapsed' | 'half' | 'expanded';

interface SnapHeights {
  collapsed: number;
  half: number;
  expanded: number;
}

/** Default snap point percentages of viewport height */
const DEFAULT_SNAP_CONFIG: SnapPointConfig = {
  collapsedPercent: 7,
  halfPercent: 50,
  expandedPercent: 75,
};

/**
 * Safe window height getter for SSR
 */
function getWindowHeight(): number {
  if (typeof window === 'undefined') return UI_CONFIG.SSR_FALLBACK_WINDOW_HEIGHT;
  return window.innerHeight;
}

/**
 * Calculate snap heights in pixels from percentage config and window height
 */
function calculateSnapHeights(config: SnapPointConfig, windowHeight: number): SnapHeights {
  return {
    collapsed: (config.collapsedPercent / 100) * windowHeight,
    half: (config.halfPercent / 100) * windowHeight,
    expanded: (config.expandedPercent / 100) * windowHeight,
  };
}

interface UseSnapPointsReturn {
  height: number;
  setHeight: React.Dispatch<React.SetStateAction<number>>;
  isMounted: boolean;
  snapHeights: SnapHeights;
  getCurrentSnapPoint: () => SnapPointName;
  snapToNearest: (currentHeight: number) => SnapPointName;
  clampHeight: (newHeight: number) => number;
}

/**
 * Hook for managing snap point behavior in bottom sheets
 * 
 * @param config - Optional snap point configuration with percentage values
 * @returns Object containing height state, snap heights, and utility functions
 */
export function useSnapPoints(config: SnapPointConfig = DEFAULT_SNAP_CONFIG): UseSnapPointsReturn {
  // Destructure config to use primitive values in dependency arrays
  // This prevents unnecessary recalculations when caller passes a new object reference
  const { collapsedPercent, halfPercent, expandedPercent } = config;
  
  // Track window height for responsive snap points
  const [windowHeight, setWindowHeight] = useState(() => getWindowHeight());
  
  const [height, setHeight] = useState(() => {
    const vh = getWindowHeight();
    return (collapsedPercent / 100) * vh;
  });
  const [isMounted, setIsMounted] = useState(false);

  /** Snap heights in pixels (memoized on primitive values) */
  const snapHeights = useMemo(
    () => calculateSnapHeights({ collapsedPercent, halfPercent, expandedPercent }, windowHeight),
    [collapsedPercent, halfPercent, expandedPercent, windowHeight]
  );

  // Track mount state for SSR safety and handle window resize
  // This is a legitimate SSR hydration pattern - we need to set initial state after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    setHeight(snapHeights.collapsed);
    
    // Update snap heights when window resizes
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    // Also listen for orientation change on mobile devices
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [snapHeights.collapsed]);

  /** Get current snap point name based on height */
  const getCurrentSnapPoint = useCallback((): SnapPointName => {
    if (height < (snapHeights.collapsed + snapHeights.half) / 2) return 'collapsed';
    if (height < (snapHeights.half + snapHeights.expanded) / 2) return 'half';
    return 'expanded';
  }, [height, snapHeights]);

  /** Snap to the nearest snap point */
  const snapToNearest = useCallback((currentHeight: number): SnapPointName => {
    const distances: [SnapPointName, number][] = [
      ['collapsed', Math.abs(currentHeight - snapHeights.collapsed)],
      ['half', Math.abs(currentHeight - snapHeights.half)],
      ['expanded', Math.abs(currentHeight - snapHeights.expanded)],
    ];

    const nearest = distances.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    setHeight(snapHeights[nearest]);
    return nearest;
  }, [snapHeights]);

  /** Clamp height between collapsed and expanded */
  const clampHeight = useCallback((newHeight: number): number => {
    return Math.max(snapHeights.collapsed, Math.min(newHeight, snapHeights.expanded));
  }, [snapHeights]);

  return {
    height,
    setHeight,
    isMounted,
    snapHeights,
    getCurrentSnapPoint,
    snapToNearest,
    clampHeight,
  };
}
