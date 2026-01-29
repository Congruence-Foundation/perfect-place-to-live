'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { GripHorizontal, ChevronDown, ChevronUp, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Factor } from '@/types';
import { FACTOR_PROFILES } from '@/config/factors';
import ProfileSelector from './ProfileSelector';
import WeightSliders from './WeightSliders';

// Snap points as percentage of viewport height from bottom
const SNAP_POINTS = {
  collapsed: 140, // Just handle + profiles (in pixels)
  half: 50, // 50% of viewport
  expanded: 85, // 85% of viewport
};

interface BottomSheetProps {
  factors: Factor[];
  selectedProfile: string | null;
  onFactorChange: (factorId: string, updates: Partial<Factor>) => void;
  onProfileSelect: (profileId: string) => void;
  onResetFactors: () => void;
}

export default function BottomSheet({
  factors,
  selectedProfile,
  onFactorChange,
  onProfileSelect,
  onResetFactors,
}: BottomSheetProps) {
  const tApp = useTranslations('app');
  const tControls = useTranslations('controls');
  const tProfiles = useTranslations('profiles');

  // Sheet height state (in pixels or percentage)
  const [sheetHeight, setSheetHeight] = useState(SNAP_POINTS.collapsed);
  const [isDragging, setIsDragging] = useState(false);
  const [isFactorsExpanded, setIsFactorsExpanded] = useState(false);
  
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const enabledFactorCount = factors.filter((f) => f.enabled && f.weight !== 0).length;
  const currentProfile = FACTOR_PROFILES.find(p => p.id === selectedProfile);

  // Convert percentage to pixels
  const getHeightInPixels = useCallback((height: number) => {
    if (height <= 100) {
      // It's a pixel value
      return height;
    }
    // It's a percentage
    return (height / 100) * window.innerHeight;
  }, []);

  // Get current snap point name
  const getCurrentSnapPoint = useCallback(() => {
    const heightPx = getHeightInPixels(sheetHeight);
    const viewportHeight = window.innerHeight;
    
    if (heightPx < 200) return 'collapsed';
    if (heightPx < viewportHeight * 0.65) return 'half';
    return 'expanded';
  }, [sheetHeight, getHeightInPixels]);

  // Snap to nearest point
  const snapToNearest = useCallback((currentHeight: number) => {
    const viewportHeight = window.innerHeight;
    const heightPx = currentHeight <= 100 ? currentHeight : (currentHeight / 100) * viewportHeight;
    
    // Calculate distances to each snap point
    const collapsedDist = Math.abs(heightPx - SNAP_POINTS.collapsed);
    const halfDist = Math.abs(heightPx - (SNAP_POINTS.half / 100) * viewportHeight);
    const expandedDist = Math.abs(heightPx - (SNAP_POINTS.expanded / 100) * viewportHeight);
    
    // Find minimum
    const minDist = Math.min(collapsedDist, halfDist, expandedDist);
    
    if (minDist === collapsedDist) {
      setSheetHeight(SNAP_POINTS.collapsed);
      setIsFactorsExpanded(false);
    } else if (minDist === halfDist) {
      setSheetHeight(SNAP_POINTS.half);
    } else {
      setSheetHeight(SNAP_POINTS.expanded);
      setIsFactorsExpanded(true);
    }
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartHeight.current = getHeightInPixels(sheetHeight);
  }, [sheetHeight, getHeightInPixels]);

  // Handle drag move
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    
    const deltaY = dragStartY.current - clientY;
    const newHeight = dragStartHeight.current + deltaY;
    const viewportHeight = window.innerHeight;
    
    // Clamp between min and max
    const clampedHeight = Math.max(
      SNAP_POINTS.collapsed,
      Math.min(newHeight, viewportHeight * (SNAP_POINTS.expanded / 100))
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

  // Toggle between collapsed and half
  const handleToggle = useCallback(() => {
    const current = getCurrentSnapPoint();
    if (current === 'collapsed') {
      setSheetHeight(SNAP_POINTS.half);
    } else {
      setSheetHeight(SNAP_POINTS.collapsed);
      setIsFactorsExpanded(false);
    }
  }, [getCurrentSnapPoint]);

  // Calculate actual height for styling
  const actualHeight = sheetHeight <= 100 
    ? `${sheetHeight}px` 
    : `${sheetHeight}vh`;

  const isCollapsed = getCurrentSnapPoint() === 'collapsed';

  return (
    <div
      ref={sheetRef}
      className={`fixed bottom-0 left-0 right-0 z-[1002] bg-background/95 backdrop-blur-sm rounded-t-2xl shadow-lg border-t ${
        isDragging ? '' : 'bottom-sheet'
      }`}
      style={{ 
        height: actualHeight,
        maxHeight: '85vh',
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
  );
}
