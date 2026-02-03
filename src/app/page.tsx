'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import MapContainer, { MapContainerRef } from '@/components/Map/MapContainer';
import { WeightSliders, CitySearch, ProfileSelector, MapSettings, DebugInfo, AppInfo, LanguageSwitcher, BottomSheet, ExtensionsSidebar, RefreshButton } from '@/components/Controls';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { DEFAULT_FACTORS, applyProfile, FACTOR_PROFILES } from '@/config/factors';
import { Bounds, Factor, HeatmapPoint, POI, DistanceCurve, DataSource } from '@/types';
import type { HeatmapSettings } from '@/types';
import { useHeatmapTiles, useIsMobile, useNotification } from '@/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, ChevronLeft, ChevronRight, SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';
import { Toast } from '@/components/ui/toast';
import { useMapStore } from '@/stores/mapStore';
import { ExtensionControllers } from '@/components/ExtensionControllers';
import { UI_CONFIG } from '@/constants/performance';
import { Z_INDEX } from '@/constants/z-index';

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
    dataSource?: DataSource;
    poiCounts: Record<string, number>;
  } | null;
  usedFallback: boolean;
  clearFallbackNotification: () => void;
  // Bounds state lifted from parent
  bounds: Bounds | null;
  zoomLevel: number;
  onBoundsChange: (bounds: Bounds, zoom: number) => void;
  // Settings from parent
  distanceCurve: DistanceCurve;
  sensitivity: number;
  normalizeToViewport: boolean;
  useOverpassAPI: boolean;
  onSettingsChange: (settings: { distanceCurve?: DistanceCurve; sensitivity?: number; normalizeToViewport?: boolean }) => void;
  onUseOverpassAPIChange: (use: boolean) => void;
  // Actions
  onAbort: () => void;
  onRefresh: () => void;
  // Tiles for canvas bounds (synchronous with heatmapPoints)
  heatmapTileCoords: { z: number; x: number; y: number }[];
  // Flag indicating if heatmap data is ready for current tiles
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
  const tApp = useTranslations('app');
  const tControls = useTranslations('controls');
  const tProfiles = useTranslations('profiles');

  const isMobile = useIsMobile();
  
  // Get store actions for updating map state
  const setMapContext = useMapStore((s) => s.setMapContext);
  const setMapReady = useMapStore((s) => s.setMapReady);

  // bounds and zoomLevel now come from props
  const [factors, setFactors] = useState<Factor[]>(DEFAULT_FACTORS);
  const [selectedProfile, setSelectedProfile] = useState<string | null>('balanced');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isFactorsExpanded, setIsFactorsExpanded] = useState(false);
  const [showPOIs, setShowPOIs] = useState(false);
  
  // Local heatmap settings that sync with parent
  const [heatmapSettings, setHeatmapSettings] = useState<HeatmapSettings>({
    gridCellSize: UI_CONFIG.DEFAULT_GRID_CELL_SIZE,
    distanceCurve: distanceCurve,
    sensitivity: sensitivity,
    normalizeToViewport: normalizeToViewport,
    clusterPriceDisplay: 'median',
    clusterPriceAnalysis: 'simplified',
    detailedModeThreshold: UI_CONFIG.DEFAULT_DETAILED_MODE_THRESHOLD,
  });

  // Track bottom sheet height for mobile loading overlay positioning
  const [bottomSheetHeight, setBottomSheetHeight] = useState(() => {
    if (typeof window === 'undefined') return 56;
    return window.innerHeight * 0.07;
  });

  const mapRef = useRef<MapContainerRef>(null);
  const { notification, showNotification } = useNotification();

  // Debounce bounds and factors to avoid too many API calls
  const debouncedBounds = useDebounce(bounds, UI_CONFIG.BOUNDS_DEBOUNCE_MS);
  const debouncedFactors = useDebounce(factors, UI_CONFIG.FACTORS_DEBOUNCE_MS);

  // Track if user has interacted (searched for a city)
  const hasInteracted = useRef(false);
  
  // Track previous bounds to detect zoom changes
  const prevBoundsRef = useRef<Bounds | null>(null);
  // Track if geolocation has been attempted
  const geoLocationAttempted = useRef(false);
  // Track previous context values to avoid unnecessary updates
  const prevContextRef = useRef<string>('');
  // Track previous heatmap data to avoid unnecessary store updates
  const prevHeatmapRef = useRef<{ points: HeatmapPoint[] }>({ points: [] });
  // Track previous settings to avoid unnecessary store updates
  const prevSettingsRef = useRef<string>('');

  // Handle map ready callback - update map store
  const handleMapReady = useCallback((map: L.Map, L: typeof import('leaflet'), extensionLayer: L.LayerGroup) => {
    setMapReady(map, L, extensionLayer);
  }, [setMapReady]);

  // Update map store when bounds/zoom change (use ref to avoid loop)
  useEffect(() => {
    const contextKey = JSON.stringify({
      bounds: debouncedBounds,
      zoom: zoomLevel,
    });
    if (contextKey !== prevContextRef.current) {
      prevContextRef.current = contextKey;
      setMapContext({ bounds: debouncedBounds, zoom: zoomLevel });
    }
  }, [debouncedBounds, zoomLevel, setMapContext]);

  // Update map store when heatmap data changes (with reference check)
  useEffect(() => {
    // Only update if the actual data changed (not just reference)
    if (heatmapPoints !== prevHeatmapRef.current.points) {
      prevHeatmapRef.current = { points: heatmapPoints };
      setMapContext({ heatmapPoints });
    }
  }, [heatmapPoints, setMapContext]);

  // Update map store when settings change (with hash check)
  useEffect(() => {
    const settingsKey = JSON.stringify({
      gridCellSize: heatmapSettings.gridCellSize,
      clusterPriceDisplay: heatmapSettings.clusterPriceDisplay,
      clusterPriceAnalysis: heatmapSettings.clusterPriceAnalysis,
      detailedModeThreshold: heatmapSettings.detailedModeThreshold,
    });
    if (settingsKey !== prevSettingsRef.current) {
      prevSettingsRef.current = settingsKey;
      setMapContext({
        gridCellSize: heatmapSettings.gridCellSize,
        clusterPriceDisplay: heatmapSettings.clusterPriceDisplay,
        clusterPriceAnalysis: heatmapSettings.clusterPriceAnalysis,
        detailedModeThreshold: heatmapSettings.detailedModeThreshold,
      });
    }
  }, [heatmapSettings.gridCellSize, heatmapSettings.clusterPriceDisplay, heatmapSettings.clusterPriceAnalysis, heatmapSettings.detailedModeThreshold, setMapContext]);

  // Update map store when factors change (for tile-based fetching)
  useEffect(() => {
    setMapContext({ factors: debouncedFactors });
  }, [debouncedFactors, setMapContext]);

  // Request user's geolocation on mount and fly to their location
  useEffect(() => {
    if (geoLocationAttempted.current) return;
    geoLocationAttempted.current = true;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          mapRef.current?.flyTo(latitude, longitude, UI_CONFIG.DEFAULT_FLY_TO_ZOOM);
          hasInteracted.current = true;
        },
        () => {
          // Geolocation not available or denied - silently ignore
        },
        {
          enableHighAccuracy: false,
          timeout: UI_CONFIG.GEOLOCATION_TIMEOUT_MS,
          maximumAge: UI_CONFIG.GEOLOCATION_MAX_AGE_MS,
        }
      );
    }
  }, []);

  const handleBoundsChangeInternal = useCallback((newBounds: Bounds, zoom: number) => {
    if (prevBoundsRef.current && !hasInteracted.current) {
      const prevArea = (prevBoundsRef.current.east - prevBoundsRef.current.west) * 
                       (prevBoundsRef.current.north - prevBoundsRef.current.south);
      const newArea = (newBounds.east - newBounds.west) * 
                      (newBounds.north - newBounds.south);
      if (newArea < prevArea * 0.9) {
        hasInteracted.current = true;
      }
    }
    prevBoundsRef.current = newBounds;
    // Call parent's onBoundsChange to lift state
    onBoundsChange(newBounds, zoom);
  }, [onBoundsChange]);

  const handleFactorChange = useCallback((factorId: string, updates: Partial<Factor>) => {
    setFactors((prev) =>
      prev.map((f) => (f.id === factorId ? { ...f, ...updates } : f))
    );
    setSelectedProfile(null);
    hasInteracted.current = true;
  }, []);

  const handleProfileSelect = useCallback((profileId: string) => {
    setSelectedProfile(profileId);
    setFactors(applyProfile(profileId));
    hasInteracted.current = true;
  }, []);

  const handleResetFactors = useCallback(() => {
    setFactors(DEFAULT_FACTORS);
    setSelectedProfile('balanced');
  }, []);

  const handleSettingsChange = useCallback((updates: Partial<HeatmapSettings>) => {
    setHeatmapSettings((prev) => ({ ...prev, ...updates }));
    // Notify parent of heatmap-related settings changes
    if (updates.distanceCurve !== undefined || updates.sensitivity !== undefined || updates.normalizeToViewport !== undefined) {
      onSettingsChange({
        distanceCurve: updates.distanceCurve,
        sensitivity: updates.sensitivity,
        normalizeToViewport: updates.normalizeToViewport,
      });
    }
    hasInteracted.current = true;
  }, [onSettingsChange]);

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

  const enabledFactorCount = factors.filter((f) => f.enabled && f.weight !== 0).length;
  const totalPOICount = Object.values(pois).reduce((sum, arr) => sum + arr.length, 0);

  // Disable refresh button only when viewport has too many tiles
  const isRefreshDisabled = isTooLarge;

  const panelWidth = isPanelOpen && !isMobile ? UI_CONFIG.PANEL_WIDTH : 0;

  const currentProfile = FACTOR_PROFILES.find(p => p.id === selectedProfile);

  return (
    <main className="h-screen w-screen flex overflow-hidden relative">
      {/* Search Box - Floating on top center */}
      <div 
        className={`absolute z-[${Z_INDEX.SEARCH_BOX}] ${
          isMobile 
            ? 'top-4 left-14 right-24' 
            : 'top-4'
        }`}
        style={!isMobile ? { 
          left: `calc(${panelWidth}px + (100% - ${panelWidth}px) / 2)`,
          transform: 'translateX(-50%)'
        } : undefined}
      >
        <CitySearch onCitySelect={handleCitySelect} isMobile={isMobile} />
      </div>

      {/* Desktop: Control Panel - Clean, borderless design */}
      {!isMobile && (
        <div
          className={`${
            isPanelOpen ? 'w-80' : 'w-0'
          } transition-all duration-300 flex-shrink-0 overflow-hidden bg-background/95 backdrop-blur-sm relative z-[${Z_INDEX.CONTROL_PANEL}]`}
        >
          <div className="w-80 h-full overflow-y-auto scrollbar-hidden">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{tApp('title')}</h1>
              <InfoTooltip>
                <p className="text-xs">{tApp('description')}</p>
              </InfoTooltip>
            </div>

            {/* Profiles Section */}
            <div className="px-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tControls('profile')}</span>
              </div>
              <ProfileSelector
                selectedProfile={selectedProfile}
                onProfileSelect={handleProfileSelect}
              />
              {currentProfile && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {tProfiles(`${currentProfile.id}.description`)}
                </p>
              )}
            </div>

            {/* Factors Section - Collapsible */}
            <div className="px-5 pb-4">
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
                      <span className="text-xs text-muted-foreground">{tControls('active', { count: enabledFactorCount })}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    {isFactorsExpanded && (
                      <Button variant="ghost" size="sm" onClick={handleResetFactors} className="h-7 px-2 text-xs animate-in fade-in slide-in-from-right-2 duration-200">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {tControls('reset')}
                      </Button>
                    )}
                    <button
                      onClick={() => setIsFactorsExpanded(!isFactorsExpanded)}
                      className="p-1 hover:bg-background/50 rounded transition-colors"
                    >
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isFactorsExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Expanded content - inside the panel */}
                {isFactorsExpanded && (
                  <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="border-t border-background/50 pt-3">
                      {/* Factor Sliders */}
                      <WeightSliders factors={factors} onFactorChange={handleFactorChange} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="mx-5 border-t" />

            {/* Extensions Section */}
            <ExtensionsSidebar />
          </div>
        </div>
      )}

      {/* Desktop: Collapse/Expand Toggle */}
      {!isMobile && (
        <button
          onClick={() => {
            setIsPanelOpen(!isPanelOpen);
            setTimeout(() => {
              mapRef.current?.invalidateSize();
            }, UI_CONFIG.PANEL_ANIMATION_DURATION_MS);
          }}
          className={`absolute top-1/2 -translate-y-1/2 z-[${Z_INDEX.CONTROL_PANEL + 1}] flex items-center justify-center
            w-6 h-12 bg-background/95 backdrop-blur-sm border border-l-0 rounded-r-lg shadow-sm
            hover:bg-muted transition-colors
            ${isPanelOpen ? 'left-80' : 'left-0'}`}
          style={{ transition: 'left 0.3s' }}
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
        <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2">
          <LanguageSwitcher />
          <AppInfo isMobile={isMobile} />
        </div>

        {/* Desktop: Bottom Controls */}
        {!isMobile && (
          <>
            {/* Refresh/Stop Button - Bottom Center */}
            <div className={`absolute left-1/2 -translate-x-1/2 bottom-4 z-[${Z_INDEX.FLOATING_CONTROLS}]`}>
              <RefreshButton
                isLoading={isLoading}
                disabled={isRefreshDisabled}
                disabledReason={isTooLarge ? 'tooLarge' : null}
                onRefresh={onRefresh}
                onAbort={onAbort}
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
              onSettingsChange={handleSettingsChange}
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
            className={`absolute inset-0 bg-background/30 backdrop-blur-[2px] flex items-center justify-center z-[${Z_INDEX.FLOATING_CONTROLS - 1}]`}
            style={isMobile ? { 
              bottom: `${bottomSheetHeight}px`,
              alignItems: 'center',
            } : undefined}
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
          onFactorChange={handleFactorChange}
          onProfileSelect={handleProfileSelect}
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
                disabled={isRefreshDisabled}
                disabledReason={isTooLarge ? 'tooLarge' : null}
                onRefresh={onRefresh}
                onAbort={onAbort}
              />

              {/* Map Settings - Right */}
              <MapSettings
                settings={heatmapSettings}
                onSettingsChange={handleSettingsChange}
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
  // Local state for bounds and zoom (lifted from HomeContent)
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(UI_CONFIG.DEFAULT_INITIAL_ZOOM);
  
  // Get other state from store
  const factors = useMapStore((s) => s.factors);
  const heatmapTileRadius = useMapStore((s) => s.heatmapTileRadius);
  const poiBufferScale = useMapStore((s) => s.poiBufferScale);
  
  // Local state for settings
  const [distanceCurve, setDistanceCurve] = useState<DistanceCurve>('exp');
  const [sensitivity, setSensitivity] = useState(2);
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
    enabled: bounds !== null && effectiveFactors.filter(f => f.enabled && f.weight !== 0).length > 0,
  });

  // Callbacks to update settings from HomeContent
  const handleSettingsFromContent = useCallback((settings: {
    distanceCurve?: DistanceCurve;
    sensitivity?: number;
    normalizeToViewport?: boolean;
  }) => {
    if (settings.distanceCurve !== undefined) setDistanceCurve(settings.distanceCurve);
    if (settings.sensitivity !== undefined) setSensitivity(settings.sensitivity);
    if (settings.normalizeToViewport !== undefined) setNormalizeToViewport(settings.normalizeToViewport);
  }, []);

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
