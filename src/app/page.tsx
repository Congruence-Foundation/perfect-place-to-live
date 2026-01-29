'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import MapContainer, { MapContainerRef } from '@/components/Map/MapContainer';
import { WeightSliders, CitySearch, HeatmapSettings, ProfileSelector, MapSettings, DebugInfo, AppInfo, LanguageSwitcher } from '@/components/Controls';
import { Button } from '@/components/ui/button';
import { DEFAULT_FACTORS, applyProfile, FACTOR_PROFILES } from '@/config/factors';
import { Bounds, Factor } from '@/types';
import { useHeatmap } from '@/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Square, SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';

export default function Home() {
  const t = useTranslations();
  const tApp = useTranslations('app');
  const tControls = useTranslations('controls');
  const tProfiles = useTranslations('profiles');

  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [factors, setFactors] = useState<Factor[]>(DEFAULT_FACTORS);
  const [selectedProfile, setSelectedProfile] = useState<string | null>('balanced');
  const [mode, setMode] = useState<'realtime' | 'precomputed'>('realtime');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isFactorsExpanded, setIsFactorsExpanded] = useState(false);
  const [showPOIs, setShowPOIs] = useState(false);
  const [heatmapSettings, setHeatmapSettings] = useState<HeatmapSettings>({
    gridCellSize: 150, // default 150m
    distanceCurve: 'exp', // exponential for sharp drop-off near POIs
    sensitivity: 2, // 2x sensitivity for more pronounced differences
    normalizeToViewport: false, // absolute scoring by default
  });

  const mapRef = useRef<MapContainerRef>(null);

  const { heatmapPoints, pois, isLoading, error, metadata, fetchHeatmap, clearHeatmap, abortFetch } = useHeatmap();

  // Debounce bounds and factors to avoid too many API calls
  const debouncedBounds = useDebounce(bounds, 500);
  const debouncedFactors = useDebounce(factors, 300);
  const debouncedSettings = useDebounce(heatmapSettings, 300);

  // Track if user has interacted (searched for a city)
  const hasInteracted = useRef(false);

  const handleBoundsChange = useCallback((newBounds: Bounds) => {
    setBounds(newBounds);
  }, []);

  const handleFactorChange = useCallback((factorId: string, updates: Partial<Factor>) => {
    setFactors((prev) =>
      prev.map((f) => (f.id === factorId ? { ...f, ...updates } : f))
    );
    // Clear profile selection when user manually changes factors
    setSelectedProfile(null);
    // Mark as interacted so the heatmap updates
    hasInteracted.current = true;
  }, []);

  const handleProfileSelect = useCallback((profileId: string) => {
    setSelectedProfile(profileId);
    setFactors(applyProfile(profileId));
    // Mark as interacted so the heatmap updates
    hasInteracted.current = true;
  }, []);

  const handleResetFactors = useCallback(() => {
    setFactors(DEFAULT_FACTORS);
    setSelectedProfile('balanced');
  }, []);

  const handleSettingsChange = useCallback((updates: Partial<HeatmapSettings>) => {
    setHeatmapSettings((prev) => ({ ...prev, ...updates }));
    // Mark as interacted so the heatmap updates
    hasInteracted.current = true;
  }, []);

  const handleRefresh = useCallback(() => {
    // Use current values, not debounced, for immediate refresh
    if (bounds && mode === 'realtime') {
      // Mark as interacted so future auto-updates work
      hasInteracted.current = true;
      
      // Check viewport size
      const latRange = bounds.north - bounds.south;
      const lngRange = bounds.east - bounds.west;
      if (latRange > 1 || lngRange > 1.5) {
        console.log('Viewport too large for refresh');
        return;
      }
      
      fetchHeatmap(
        bounds,
        factors,
        heatmapSettings.gridCellSize,
        heatmapSettings.distanceCurve,
        heatmapSettings.sensitivity,
        heatmapSettings.normalizeToViewport
      );
    }
  }, [bounds, factors, heatmapSettings, mode, fetchHeatmap]);

  const handleCitySelect = useCallback((lat: number, lng: number, cityBounds?: Bounds) => {
    // Mark that user has interacted
    hasInteracted.current = true;
    
    if (cityBounds) {
      // Use fitBounds for better framing of the city
      mapRef.current?.fitBounds(cityBounds);
    } else {
      // Fallback to flyTo if no bounds available
      mapRef.current?.flyTo(lat, lng, 13);
    }
  }, []);

  // Fetch heatmap when bounds or factors change (debounced)
  useEffect(() => {
    if (!debouncedBounds || mode !== 'realtime') return;

    // Only fetch if user has interacted (searched for a city) or manually refreshed
    if (!hasInteracted.current) {
      return;
    }

    const enabledFactors = debouncedFactors.filter((f) => f.enabled && f.weight !== 0);
    if (enabledFactors.length === 0) {
      clearHeatmap();
      return;
    }

    // Calculate viewport size to determine if we should fetch
    const latRange = debouncedBounds.north - debouncedBounds.south;
    const lngRange = debouncedBounds.east - debouncedBounds.west;

    // Don't fetch if viewport is too large (zoomed out too much)
    if (latRange > 1 || lngRange > 1.5) {
      return;
    }

    fetchHeatmap(
      debouncedBounds,
      debouncedFactors,
      debouncedSettings.gridCellSize,
      debouncedSettings.distanceCurve,
      debouncedSettings.sensitivity,
      debouncedSettings.normalizeToViewport
    );
  }, [debouncedBounds, debouncedFactors, debouncedSettings, mode, fetchHeatmap, clearHeatmap]);

  const enabledFactorCount = factors.filter((f) => f.enabled && f.weight !== 0).length;
  const totalPOICount = Object.values(pois).reduce((sum, arr) => sum + arr.length, 0);

  // Calculate search box position - centered on map area, not whole screen
  const panelWidth = isPanelOpen ? 320 : 0; // 320px = w-80

  // Get current profile description
  const currentProfile = FACTOR_PROFILES.find(p => p.id === selectedProfile);

  return (
    <main className="h-screen w-screen flex overflow-hidden relative">
      {/* Search Box - Floating on top center of MAP area */}
      <div 
        className="absolute top-4 z-[1001] transition-all duration-300"
        style={{ 
          left: `calc(${panelWidth}px + (100% - ${panelWidth}px) / 2)`,
          transform: 'translateX(-50%)'
        }}
      >
        <CitySearch onCitySelect={handleCitySelect} />
      </div>

      {/* Control Panel - Clean, borderless design */}
      <div
        className={`${
          isPanelOpen ? 'w-80' : 'w-0'
        } transition-all duration-300 flex-shrink-0 overflow-hidden bg-background/95 backdrop-blur-sm relative z-[1002]`}
      >
        <div className="w-80 h-full overflow-y-auto scrollbar-hidden">
          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <h1 className="text-xl font-semibold tracking-tight">{tApp('title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{tApp('subtitle')}</p>
          </div>

          {/* Profiles Section */}
          <div className="px-5 pb-4">
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

          {/* Divider */}
          <div className="mx-5 border-t" />

          {/* Factors Section - Collapsible */}
          <div className="px-5 py-4">
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
        </div>
      </div>

      {/* Collapse/Expand Toggle */}
      <button
        onClick={() => {
          setIsPanelOpen(!isPanelOpen);
          setTimeout(() => {
            mapRef.current?.invalidateSize();
          }, 350);
        }}
        className={`absolute top-1/2 -translate-y-1/2 z-[1003] flex items-center justify-center
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

      {/* Map Area */}
      <div className="flex-1 relative">
        <MapContainer
          ref={mapRef}
          onBoundsChange={handleBoundsChange}
          heatmapPoints={heatmapPoints}
          heatmapOpacity={0.5}
          pois={pois}
          showPOIs={showPOIs}
          factors={factors}
        />

        {/* Top Right Controls - Language Switcher and App Info */}
        <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2">
          <LanguageSwitcher />
          <AppInfo />
        </div>

        {/* Refresh/Abort Button - Bottom Center */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
          {isLoading ? (
            <Button
              variant="destructive"
              size="sm"
              className="shadow-lg rounded-full px-4"
              onClick={abortFetch}
            >
              <Square className="h-4 w-4 fill-current" />
              <span className="ml-2">{tControls('stop')}</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="shadow-lg rounded-full px-4 bg-background/95 backdrop-blur-sm"
              onClick={handleRefresh}
              disabled={!bounds || mode !== 'realtime'}
            >
              <RefreshCw className="h-4 w-4" />
              <span className="ml-2">{tControls('refresh')}</span>
            </Button>
          )}
        </div>

        {/* Debug Info - Bottom Left */}
        <DebugInfo
          enabledFactorCount={enabledFactorCount}
          metadata={metadata}
          totalPOICount={totalPOICount}
          error={error}
        />

        {/* Map Settings - Bottom Right */}
        <MapSettings
          settings={heatmapSettings}
          onSettingsChange={handleSettingsChange}
          showPOIs={showPOIs}
          onShowPOIsChange={setShowPOIs}
          mode={mode}
          onModeChange={setMode}
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px] flex items-center justify-center z-[999]">
            <div className="bg-background/95 backdrop-blur-sm px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">{tControls('calculating')}</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
