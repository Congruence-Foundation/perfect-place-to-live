'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

import { useTranslations } from 'next-intl';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

import type { Bounds, Factor, HeatmapPoint, POI, DistanceCurve, POIDataSource, HeatmapSettings } from '@/types';
import { DEFAULT_FACTORS } from '@/config/factors';
import { UI_CONFIG } from '@/constants/performance';
import { Z_INDEX } from '@/constants/z-index';
import {
  useHeatmapTiles,
  useIsMobile,
  useNotification,
  useDebounce,
  useFactors,
  useGeolocation,
  useHeatmapSettings,
  useMapStoreSync,
} from '@/hooks';
import { useMapStore } from '@/stores/mapStore';
import MapContainer, { type MapContainerRef } from '@/components/Map/MapContainer';
import {
  CitySearch,
  MapSettings,
  DebugInfo,
  AppInfo,
  LanguageSwitcher,
  BottomSheet,
  RefreshButton,
  DesktopControlPanel,
} from '@/components/Controls';
import { Toast } from '@/components/ui/toast';
import { ExtensionControllers } from '@/components/ExtensionControllers';

/**
 * Props for HomeContent - data passed from wrapper
 */
interface HomeContentProps {
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  isLoading: boolean;
  isTooLarge: boolean;
  error: string | null;
  metadata: {
    gridSize: number | string;
    pointCount: number;
    computeTimeMs: number;
    factorCount: number;
    dataSource?: POIDataSource;
    poiCounts: Record<string, number>;
  } | null;
  usedFallback: boolean;
  clearFallbackNotification: () => void;
  bounds: Bounds | null;
  zoomLevel: number;
  onBoundsChange: (bounds: Bounds, zoom: number) => void;
  distanceCurve: DistanceCurve;
  sensitivity: number;
  normalizeToViewport: boolean;
  useOverpassAPI: boolean;
  onSettingsChange: (settings: {
    distanceCurve?: DistanceCurve;
    sensitivity?: number;
    normalizeToViewport?: boolean;
  }) => void;
  onUseOverpassAPIChange: (use: boolean) => void;
  onAbort: () => void;
  onRefresh: () => void;
  heatmapTileCoords: { z: number; x: number; y: number }[];
  isHeatmapDataReady: boolean;
}

/**
 * Inner component that contains the main UI.
 */
function HomeContent({
  heatmapPoints,
  pois,
  isLoading,
  isTooLarge,
  error,
  metadata,
  usedFallback,
  clearFallbackNotification,
  bounds,
  zoomLevel,
  onBoundsChange,
  distanceCurve,
  sensitivity,
  normalizeToViewport,
  useOverpassAPI,
  onSettingsChange,
  onUseOverpassAPIChange,
  onAbort,
  onRefresh,
  heatmapTileCoords,
  isHeatmapDataReady,
}: HomeContentProps) {
  const tControls = useTranslations('controls');
  const isMobile = useIsMobile();

  // Store actions
  const setMapReady = useMapStore((s) => s.setMapReady);
  const analyticsProgress = useMapStore((s) => s.analyticsProgress);

  // Factor management
  const {
    factors,
    selectedProfile,
    enabledFactorCount,
    handleFactorChange: onFactorChange,
    handleProfileSelect,
    handleResetFactors,
  } = useFactors();

  // UI state
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isFactorsExpanded, setIsFactorsExpanded] = useState(false);
  const [showPOIs, setShowPOIs] = useState(false);

  // Heatmap settings with parent sync
  const { heatmapSettings, handleSettingsChange } = useHeatmapSettings({
    initialDistanceCurve: distanceCurve,
    initialSensitivity: sensitivity,
    initialNormalizeToViewport: normalizeToViewport,
    onSettingsChange,
  });

  // Bottom sheet height for mobile loading overlay positioning
  const [bottomSheetHeight, setBottomSheetHeight] = useState<number>(
    UI_CONFIG.DEFAULT_BOTTOM_SHEET_HEIGHT
  );

  // Update to actual window height after mount (SSR hydration pattern)
  // Using requestAnimationFrame to avoid synchronous setState in effect
  useEffect(() => {
    const updateHeight = () => {
      setBottomSheetHeight(window.innerHeight * UI_CONFIG.BOTTOM_SHEET_HEIGHT_RATIO);
    };
    requestAnimationFrame(updateHeight);
  }, []);

  const mapRef = useRef<MapContainerRef>(null);
  const { notification, showNotification } = useNotification();

  // Debounce bounds and factors to avoid too many API calls
  const debouncedBounds = useDebounce(bounds, UI_CONFIG.BOUNDS_DEBOUNCE_MS);
  const debouncedFactors = useDebounce(factors, UI_CONFIG.FACTORS_DEBOUNCE_MS);

  // Track interaction state for zoom detection
  const hasInteracted = useRef(false);
  const prevBoundsRef = useRef<Bounds | null>(null);

  // Sync state to map store
  useMapStoreSync({
    debouncedBounds,
    zoomLevel,
    heatmapPoints,
    heatmapSettings,
    debouncedFactors,
  });

  // Request geolocation on mount
  useGeolocation({
    onSuccess: (latitude, longitude) => {
      mapRef.current?.flyTo(latitude, longitude, UI_CONFIG.DEFAULT_FLY_TO_ZOOM);
      hasInteracted.current = true;
    },
  });

  // Handle map ready callback
  const handleMapReady = useCallback(
    (map: L.Map, L: typeof import('leaflet'), extensionLayer: L.LayerGroup) => {
      setMapReady(map, L, extensionLayer);
    },
    [setMapReady]
  );

  // Handle bounds change with zoom detection
  const handleBoundsChangeInternal = useCallback(
    (newBounds: Bounds, zoom: number) => {
      if (prevBoundsRef.current && !hasInteracted.current) {
        const prevArea =
          (prevBoundsRef.current.east - prevBoundsRef.current.west) *
          (prevBoundsRef.current.north - prevBoundsRef.current.south);
        const newArea =
          (newBounds.east - newBounds.west) * (newBounds.north - newBounds.south);
        if (newArea < prevArea * UI_CONFIG.ZOOM_CHANGE_THRESHOLD) {
          hasInteracted.current = true;
        }
      }
      prevBoundsRef.current = newBounds;
      onBoundsChange(newBounds, zoom);
    },
    [onBoundsChange]
  );

  // Wrap factor change to track interaction
  const handleFactorChange = useCallback(
    (factorId: string, updates: Partial<Factor>) => {
      onFactorChange(factorId, updates);
      hasInteracted.current = true;
    },
    [onFactorChange]
  );

  // Wrap profile select to track interaction
  const handleProfileSelectWithInteraction = useCallback(
    (profileId: string) => {
      handleProfileSelect(profileId);
      hasInteracted.current = true;
    },
    [handleProfileSelect]
  );

  // Wrap settings change to track interaction
  const handleSettingsChangeWithInteraction = useCallback(
    (updates: Partial<HeatmapSettings>) => {
      handleSettingsChange(updates);
      hasInteracted.current = true;
    },
    [handleSettingsChange]
  );

  // Handle city selection
  const handleCitySelect = useCallback((lat: number, lng: number, cityBounds?: Bounds) => {
    hasInteracted.current = true;
    if (cityBounds) {
      mapRef.current?.fitBounds(cityBounds);
    } else {
      mapRef.current?.flyTo(lat, lng, UI_CONFIG.DEFAULT_FLY_TO_ZOOM);
    }
  }, []);

  // Show notification when fallback to Overpass occurs
  useEffect(() => {
    if (usedFallback && !useOverpassAPI) {
      showNotification(tControls('fallbackNotice'), UI_CONFIG.NOTIFICATION_DURATION_MS);
      clearFallbackNotification();
    }
  }, [usedFallback, useOverpassAPI, showNotification, clearFallbackNotification, tControls]);

  // Toggle panel with map resize
  const handlePanelToggle = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, UI_CONFIG.PANEL_ANIMATION_DURATION_MS);
  }, []);

  const totalPOICount = Object.values(pois).reduce((sum, arr) => sum + arr.length, 0);
  const panelWidth = isPanelOpen && !isMobile ? UI_CONFIG.PANEL_WIDTH : 0;

  return (
    <main className="h-screen w-screen flex overflow-hidden relative">
      {/* Search Box - Floating on top center */}
      <div
        className={`absolute ${isMobile ? 'top-4 left-14 right-24' : 'top-4'}`}
        style={{
          zIndex: Z_INDEX.SEARCH_BOX,
          ...(!isMobile
            ? {
                left: `calc(${panelWidth}px + (100% - ${panelWidth}px) / 2)`,
                transform: 'translateX(-50%)',
              }
            : {}),
        }}
      >
        <CitySearch onCitySelect={handleCitySelect} isMobile={isMobile} />
      </div>

      {/* Desktop: Control Panel */}
      {!isMobile && (
        <DesktopControlPanel
          isPanelOpen={isPanelOpen}
          factors={factors}
          selectedProfile={selectedProfile}
          isFactorsExpanded={isFactorsExpanded}
          enabledFactorCount={enabledFactorCount}
          onFactorChange={handleFactorChange}
          onProfileSelect={handleProfileSelectWithInteraction}
          onResetFactors={handleResetFactors}
          onToggleFactorsExpanded={() => setIsFactorsExpanded(!isFactorsExpanded)}
        />
      )}

      {/* Desktop: Collapse/Expand Toggle */}
      {!isMobile && (
        <button
          onClick={handlePanelToggle}
          className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center
            w-6 h-12 bg-background/95 backdrop-blur-sm border border-l-0 rounded-r-lg shadow-sm
            hover:bg-muted transition-colors
            ${isPanelOpen ? 'left-80' : 'left-0'}`}
          style={{ transition: 'left 0.3s', zIndex: Z_INDEX.CONTROL_PANEL + 1 }}
          title={isPanelOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {isPanelOpen ? (
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Map Area */}
      <div className="flex-1 relative">
        <MapContainer
          ref={mapRef}
          onBoundsChange={handleBoundsChangeInternal}
          heatmapPoints={heatmapPoints}
          heatmapOpacity={UI_CONFIG.DEFAULT_HEATMAP_OPACITY}
          pois={pois}
          showPOIs={showPOIs}
          factors={factors}
          onMapReady={handleMapReady}
          heatmapTileCoords={heatmapTileCoords}
          isHeatmapDataReady={isHeatmapDataReady}
        />

        {/* Top Right Controls - Language Switcher and App Info */}
        <div
          className="absolute top-4 right-4 flex items-center gap-2"
          style={{ zIndex: Z_INDEX.FLOATING_CONTROLS }}
        >
          <LanguageSwitcher />
          <AppInfo isMobile={isMobile} />
        </div>

        {/* Desktop: Bottom Controls */}
        {!isMobile && (
          <>
            {/* Refresh/Stop Button - Bottom Center */}
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-4"
              style={{ zIndex: Z_INDEX.FLOATING_CONTROLS }}
            >
              <RefreshButton
                isLoading={isLoading}
                disabled={isTooLarge}
                disabledReason={isTooLarge ? 'tooLarge' : null}
                onRefresh={onRefresh}
                onAbort={onAbort}
                analyticsProgress={analyticsProgress}
              />
            </div>

            {/* Debug Info - Bottom Left */}
            <DebugInfo
              enabledFactorCount={enabledFactorCount}
              metadata={metadata}
              totalPOICount={totalPOICount}
              error={error}
              isMobile={false}
              zoomLevel={zoomLevel}
            />

            {/* Map Settings - Bottom Right */}
            <MapSettings
              settings={heatmapSettings}
              onSettingsChange={handleSettingsChangeWithInteraction}
              showPOIs={showPOIs}
              onShowPOIsChange={setShowPOIs}
              useOverpassAPI={useOverpassAPI}
              onUseOverpassAPIChange={onUseOverpassAPIChange}
              isMobile={false}
            />
          </>
        )}

        {/* Loading Overlay - centered in visible map area (above bottom sheet on mobile) */}
        {isLoading && isMobile && (
          <div
            className="absolute inset-0 bg-background/30 backdrop-blur-[2px] flex items-center justify-center"
            style={{
              zIndex: Z_INDEX.FLOATING_CONTROLS - 1,
              bottom: `${bottomSheetHeight}px`,
            }}
          >
            <div className="bg-background/95 backdrop-blur-sm px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">{tControls('calculating')}</span>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        <Toast notification={notification} />
      </div>

      {/* Mobile: Bottom Sheet */}
      {isMobile && (
        <BottomSheet
          factors={factors}
          selectedProfile={selectedProfile}
          enabledFactorCount={enabledFactorCount}
          onFactorChange={handleFactorChange}
          onProfileSelect={handleProfileSelectWithInteraction}
          onResetFactors={handleResetFactors}
          onHeightChange={setBottomSheetHeight}
          floatingControls={
            <>
              {/* Debug Info - Left */}
              <DebugInfo
                enabledFactorCount={enabledFactorCount}
                metadata={metadata}
                totalPOICount={totalPOICount}
                error={error}
                isMobile={true}
                zoomLevel={zoomLevel}
              />

              {/* Loading Progress or Zoom Warning - Center */}
              <RefreshButton
                isLoading={isLoading}
                disabled={isTooLarge}
                disabledReason={isTooLarge ? 'tooLarge' : null}
                onRefresh={onRefresh}
                onAbort={onAbort}
                analyticsProgress={analyticsProgress}
              />

              {/* Map Settings - Right */}
              <MapSettings
                settings={heatmapSettings}
                onSettingsChange={handleSettingsChangeWithInteraction}
                showPOIs={showPOIs}
                onShowPOIsChange={setShowPOIs}
                useOverpassAPI={useOverpassAPI}
                onUseOverpassAPIChange={onUseOverpassAPIChange}
                isMobile={true}
              />
            </>
          }
        />
      )}
    </main>
  );
}

/**
 * Main page component.
 * Uses Zustand stores for state management and ExtensionControllers for extension side effects.
 * Uses tile-based heatmap fetching for efficient caching and incremental loading.
 */
export default function Home() {
  // Local state for bounds and zoom
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(UI_CONFIG.DEFAULT_INITIAL_ZOOM);

  // Get state from store
  const factors = useMapStore((s) => s.factors);
  const heatmapTileRadius = useMapStore((s) => s.heatmapTileRadius);
  const poiBufferScale = useMapStore((s) => s.poiBufferScale);

  // Local state for settings
  const [distanceCurve, setDistanceCurve] = useState<DistanceCurve>('exp');
  const [sensitivity, setSensitivity] = useState<number>(UI_CONFIG.DEFAULT_SENSITIVITY);
  const [normalizeToViewport, setNormalizeToViewport] = useState(false);
  const [useOverpassAPI, setUseOverpassAPI] = useState(false);

  // Handle bounds change from map
  const handleBoundsChange = useCallback((newBounds: Bounds, zoom: number) => {
    setBounds(newBounds);
    setZoomLevel(zoom);
  }, []);

  // Use tile-based heatmap fetching
  const effectiveFactors = factors.length > 0 ? factors : DEFAULT_FACTORS;
  const {
    heatmapPoints,
    pois,
    isLoading,
    isTooLarge,
    error,
    metadata,
    usedFallback,
    clearFallbackNotification,
    abort,
    refresh,
    tiles: heatmapTileCoords,
    isDataReady: isHeatmapDataReady,
  } = useHeatmapTiles({
    bounds,
    factors: effectiveFactors,
    distanceCurve,
    sensitivity,
    normalizeToViewport,
    dataSource: useOverpassAPI ? 'overpass' : 'neon',
    tileRadius: heatmapTileRadius,
    poiBufferScale,
    enabled:
      bounds !== null && effectiveFactors.filter((f) => f.enabled && f.weight !== 0).length > 0,
  });

  // Callbacks to update settings from HomeContent
  const handleSettingsFromContent = useCallback(
    (settings: {
      distanceCurve?: DistanceCurve;
      sensitivity?: number;
      normalizeToViewport?: boolean;
    }) => {
      if (settings.distanceCurve !== undefined) setDistanceCurve(settings.distanceCurve);
      if (settings.sensitivity !== undefined) setSensitivity(settings.sensitivity);
      if (settings.normalizeToViewport !== undefined)
        setNormalizeToViewport(settings.normalizeToViewport);
    },
    []
  );

  return (
    <>
      {/* Extension controllers handle side effects (fetching, rendering markers) */}
      <ExtensionControllers />

      <HomeContent
        heatmapPoints={heatmapPoints}
        pois={pois}
        isLoading={isLoading}
        isTooLarge={isTooLarge}
        error={error}
        metadata={metadata}
        usedFallback={usedFallback}
        clearFallbackNotification={clearFallbackNotification}
        bounds={bounds}
        zoomLevel={zoomLevel}
        onBoundsChange={handleBoundsChange}
        distanceCurve={distanceCurve}
        sensitivity={sensitivity}
        normalizeToViewport={normalizeToViewport}
        useOverpassAPI={useOverpassAPI}
        onSettingsChange={handleSettingsFromContent}
        onUseOverpassAPIChange={setUseOverpassAPI}
        onAbort={abort}
        onRefresh={refresh}
        heatmapTileCoords={heatmapTileCoords}
        isHeatmapDataReady={isHeatmapDataReady}
      />
    </>
  );
}
