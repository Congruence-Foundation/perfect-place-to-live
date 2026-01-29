'use client';

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { GripHorizontal, ChevronDown, ChevronUp, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Factor } from '@/types';
import { FACTOR_PROFILES } from '@/config/factors';
import ProfileSelector from './ProfileSelector';
import WeightSliders from './WeightSliders';

// Snap points configuration (all in percentage of viewport height)
const SNAP_POINTS = {
  collapsedPercent: 7, // ~7% of viewport - minimal height showing just the drag handle
  halfPercent: 50, // percentage of viewport
  expandedPercent: 75, // percentage of viewport (reduced from 85%)
};

// Safe window height getter for SSR
const getWindowHeight = () => {
  if (typeof window === 'undefined') return 800; // Default for SSR
  return window.innerHeight;
};

// Get snap point heights in pixels (for internal calculations)
const getSnapHeights = () => {
  const vh = getWindowHeight();
  return {
    collapsed: (SNAP_POINTS.collapsedPercent / 100) * vh,
    half: (SNAP_POINTS.halfPercent / 100) * vh,
    expanded: (SNAP_POINTS.expandedPercent / 100) * vh,
  };
};

interface BottomSheetProps {
  factors: Factor[];
  selectedProfile: string | null;
  onFactorChange: (factorId: string, updates: Partial<Factor>) => void;
  onProfileSelect: (profileId: string) => void;
  onResetFactors: () => void;
  floatingControls?: ReactNode;
  onHeightChange?: (height: number) => void;
}

export default function BottomSheet({
  factors,
  selectedProfile,
  onFactorChange,
  onProfileSelect,
  onResetFactors,
  floatingControls,
  onHeightChange,
}: BottomSheetProps) {
  const tApp = useTranslations('app');
  const tControls = useTranslations('controls');
  const tProfiles = useTranslations('profiles');

  // Sheet height state (always in pixels, calculated from vh)
  const [sheetHeight, setSheetHeight] = useState(() => {
    // Initialize with collapsed height (will be recalculated on mount)
    if (typeof window === 'undefined') return 56; // ~7% of 800px default
    return (SNAP_POINTS.collapsedPercent / 100) * window.innerHeight;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isFactorsExpanded, setIsFactorsExpanded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Track mount state for SSR safety and set initial height
  useEffect(() => {
    setIsMounted(true);
    // Set correct collapsed height based on actual viewport
    const snaps = getSnapHeights();
    setSheetHeight(snaps.collapsed);
  }, []);

  // Notify parent of height changes
  useEffect(() => {
    if (isMounted && onHeightChange) {
      onHeightChange(sheetHeight);
    }
  }, [sheetHeight, isMounted, onHeightChange]);

  const enabledFactorCount = factors.filter((f) => f.enabled && f.weight !== 0).length;
  const currentProfile = FACTOR_PROFILES.find(p => p.id === selectedProfile);

  // Get current snap point name
  const getCurrentSnapPoint = useCallback(() => {
    const snaps = getSnapHeights();
    
    if (sheetHeight < (snaps.collapsed + snaps.half) / 2) return 'collapsed';
    if (sheetHeight < (snaps.half + snaps.expanded) / 2) return 'half';
    return 'expanded';
  }, [sheetHeight]);

  // Snap to nearest point
  const snapToNearest = useCallback((currentHeight: number) => {
    const snaps = getSnapHeights();
    
    // Calculate distances to each snap point
    const collapsedDist = Math.abs(currentHeight - snaps.collapsed);
    const halfDist = Math.abs(currentHeight - snaps.half);
    const expandedDist = Math.abs(currentHeight - snaps.expanded);
    
    // Find minimum
    const minDist = Math.min(collapsedDist, halfDist, expandedDist);
    
    if (minDist === collapsedDist) {
      setSheetHeight(snaps.collapsed);
      setIsFactorsExpanded(false);
    } else if (minDist === halfDist) {
      setSheetHeight(snaps.half);
    } else {
      setSheetHeight(snaps.expanded);
      setIsFactorsExpanded(true);
    }
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartHeight.current = sheetHeight;
  }, [sheetHeight]);

  // Handle drag move
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    
    const deltaY = dragStartY.current - clientY;
    const newHeight = dragStartHeight.current + deltaY;
    const snaps = getSnapHeights();
    
    // Clamp between min and max
    const clampedHeight = Math.max(
      snaps.collapsed,
      Math.min(newHeight, snaps.expanded)
    );
    
    setSheetHeight(clampedHeight);
  }, [isDragging]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    snapToNearest(sheetHeight);
  }, [isDragging, sheetHeight, snapToNearest]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse event handlers (for testing on desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  }, [handleDragStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Toggle between collapsed and expanded (75%)
  const handleToggle = useCallback(() => {
    const current = getCurrentSnapPoint();
    const snaps = getSnapHeights();
    
    if (current === 'collapsed') {
      setSheetHeight(snaps.expanded); // Go to 75% instead of 50%
    } else {
      setSheetHeight(snaps.collapsed);
      setIsFactorsExpanded(false);
    }
  }, [getCurrentSnapPoint]);

  // Don't render until mounted to avoid SSR hydration issues
  if (!isMounted) {
    return null;
  }

  // Height is always in pixels now
  const actualHeight = `${sheetHeight}px`;

  return (
    <>
      {/* Floating controls - positioned relative to bottom sheet */}
      {floatingControls && (
        <div 
          className={`fixed left-0 right-0 z-[1001] px-4 pb-2 pointer-events-none ${
            isDragging ? '' : 'bottom-sheet'
          }`}
          style={{ 
            bottom: actualHeight,
          }}
        >
          <div className="flex items-center justify-between pointer-events-auto">
            {floatingControls}
          </div>
        </div>
      )}
      
      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-[1002] bg-background/95 backdrop-blur-sm rounded-t-2xl shadow-lg border-t ${
          isDragging ? '' : 'bottom-sheet'
        }`}
        style={{ 
          height: actualHeight,
          maxHeight: '75vh',
        }}
      >
      {/* Drag Handle */}
      <div
        className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClick={handleToggle}
      >
        <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        <GripHorizontal className="h-4 w-4 text-muted-foreground/50 mt-1" />
      </div>

      {/* Content */}
      <div className="px-4 pb-4 overflow-y-auto h-[calc(100%-40px)]">
        {/* Header */}
        <div className="pb-3">
          <h1 className="text-lg font-semibold tracking-tight">{tApp('title')}</h1>
          <p className="text-xs text-muted-foreground">{tApp('subtitle')}</p>
        </div>

        {/* Profiles Section */}
        <div className="pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {tControls('profile')}
            </span>
          </div>
          <ProfileSelector
            selectedProfile={selectedProfile}
            onProfileSelect={onProfileSelect}
          />
          {currentProfile && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {tProfiles(`${currentProfile.id}.description`)}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t my-3" />

        {/* Factors Section - Collapsible */}
        <div className="pb-4">
          <div className={`rounded-xl bg-muted/50 transition-colors ${isFactorsExpanded ? '' : 'hover:bg-muted'}`}>
            {/* Header - always visible */}
            <div className="flex items-center justify-between p-3">
              <button
                onClick={() => setIsFactorsExpanded(!isFactorsExpanded)}
                className="flex items-center gap-3 flex-1"
              >
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shadow-sm">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-medium block">{tControls('factors')}</span>
                  <span className="text-xs text-muted-foreground">
                    {tControls('active', { count: enabledFactorCount })}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1">
                {isFactorsExpanded && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onResetFactors}
                    className="h-7 px-2 text-xs animate-in fade-in slide-in-from-right-2 duration-200"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {tControls('reset')}
                  </Button>
                )}
                <button
                  onClick={() => setIsFactorsExpanded(!isFactorsExpanded)}
                  className="p-1 hover:bg-background/50 rounded transition-colors"
                >
                  {isFactorsExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            {/* Expanded content */}
            {isFactorsExpanded && (
              <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="border-t border-background/50 pt-3">
                  <WeightSliders factors={factors} onFactorChange={onFactorChange} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
