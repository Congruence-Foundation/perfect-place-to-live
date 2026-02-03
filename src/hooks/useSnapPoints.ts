'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';

/**
 * Snap point configuration
 */
interface SnapPointConfig {
  collapsedPercent: number;
  halfPercent: number;
  expandedPercent: number;
}

/**
 * Snap point names
 */
type SnapPointName = 'collapsed' | 'half' | 'expanded';

/**
 * Snap heights in pixels
 */
interface SnapHeights {
  collapsed: number;
  half: number;
  expanded: number;
}

const DEFAULT_SNAP_CONFIG: SnapPointConfig = {
  collapsedPercent: 7,
  halfPercent: 50,
  expandedPercent: 75,
};

/**
 * Safe window height getter for SSR
 */
function getWindowHeight(): number {
  if (typeof window === 'undefined') return 800;
  return window.innerHeight;
}

/**
 * Calculate snap heights in pixels from percentage config
 */
function calculateSnapHeights(config: SnapPointConfig): SnapHeights {
  const vh = getWindowHeight();
  return {
    collapsed: (config.collapsedPercent / 100) * vh,
    half: (config.halfPercent / 100) * vh,
    expanded: (config.expandedPercent / 100) * vh,
  };
}

/**
 * Hook for managing snap point behavior in bottom sheets
 */
export function useSnapPoints(config: SnapPointConfig = DEFAULT_SNAP_CONFIG) {
  const [height, setHeight] = useState(() => {
    if (typeof window === 'undefined') {
      return (config.collapsedPercent / 100) * 800;
    }
    return (config.collapsedPercent / 100) * window.innerHeight;
  });
  const [isMounted, setIsMounted] = useState(false);

  // Memoize snap heights to avoid recalculating on every callback call
  const snapHeights = useMemo(() => calculateSnapHeights(config), [config]);

  // Track mount state for SSR safety
  useEffect(() => {
    setIsMounted(true);
    setHeight(snapHeights.collapsed);
  }, [snapHeights.collapsed]);

  /**
   * Get snap heights in pixels
   */
  const getSnapHeights = useCallback((): SnapHeights => {
    return snapHeights;
  }, [snapHeights]);

  /**
   * Get current snap point name based on height
   */
  const getCurrentSnapPoint = useCallback((): SnapPointName => {
    if (height < (snapHeights.collapsed + snapHeights.half) / 2) return 'collapsed';
    if (height < (snapHeights.half + snapHeights.expanded) / 2) return 'half';
    return 'expanded';
  }, [height, snapHeights]);

  /**
   * Snap to the nearest snap point
   */
  const snapToNearest = useCallback((currentHeight: number): SnapPointName => {
    const collapsedDist = Math.abs(currentHeight - snapHeights.collapsed);
    const halfDist = Math.abs(currentHeight - snapHeights.half);
    const expandedDist = Math.abs(currentHeight - snapHeights.expanded);
    
    const minDist = Math.min(collapsedDist, halfDist, expandedDist);
    
    if (minDist === collapsedDist) {
      setHeight(snapHeights.collapsed);
      return 'collapsed';
    } else if (minDist === halfDist) {
      setHeight(snapHeights.half);
      return 'half';
    } else {
      setHeight(snapHeights.expanded);
      return 'expanded';
    }
  }, [snapHeights]);

  /**
   * Clamp height between collapsed and expanded
   */
  const clampHeight = useCallback((newHeight: number): number => {
    return Math.max(snapHeights.collapsed, Math.min(newHeight, snapHeights.expanded));
  }, [snapHeights]);

  return {
    height,
    setHeight,
    isMounted,
    getSnapHeights,
    getCurrentSnapPoint,
    snapToNearest,
    clampHeight,
  };
}
