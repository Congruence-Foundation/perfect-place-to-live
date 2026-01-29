'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * Snap point configuration
 */
export interface SnapPointConfig {
  collapsedPercent: number;
  halfPercent: number;
  expandedPercent: number;
}

/**
 * Snap point names
 */
export type SnapPointName = 'collapsed' | 'half' | 'expanded';

/**
 * Snap heights in pixels
 */
export interface SnapHeights {
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

  // Track mount state for SSR safety
  useEffect(() => {
    setIsMounted(true);
    const snaps = calculateSnapHeights(config);
    setHeight(snaps.collapsed);
  }, [config]);

  /**
   * Get snap heights in pixels
   */
  const getSnapHeights = useCallback((): SnapHeights => {
    return calculateSnapHeights(config);
  }, [config]);

  /**
   * Get current snap point name based on height
   */
  const getCurrentSnapPoint = useCallback((): SnapPointName => {
    const snaps = calculateSnapHeights(config);
    
    if (height < (snaps.collapsed + snaps.half) / 2) return 'collapsed';
    if (height < (snaps.half + snaps.expanded) / 2) return 'half';
    return 'expanded';
  }, [height, config]);

  /**
   * Snap to the nearest snap point
   */
  const snapToNearest = useCallback((currentHeight: number): SnapPointName => {
    const snaps = calculateSnapHeights(config);
    
    const collapsedDist = Math.abs(currentHeight - snaps.collapsed);
    const halfDist = Math.abs(currentHeight - snaps.half);
    const expandedDist = Math.abs(currentHeight - snaps.expanded);
    
    const minDist = Math.min(collapsedDist, halfDist, expandedDist);
    
    if (minDist === collapsedDist) {
      setHeight(snaps.collapsed);
      return 'collapsed';
    } else if (minDist === halfDist) {
      setHeight(snaps.half);
      return 'half';
    } else {
      setHeight(snaps.expanded);
      return 'expanded';
    }
  }, [config]);

  /**
   * Clamp height between collapsed and expanded
   */
  const clampHeight = useCallback((newHeight: number): number => {
    const snaps = calculateSnapHeights(config);
    return Math.max(snaps.collapsed, Math.min(newHeight, snaps.expanded));
  }, [config]);

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
