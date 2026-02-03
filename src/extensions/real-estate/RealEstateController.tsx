'use client';

import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMapStore } from '@/stores/mapStore';
import { useRealEstateStore } from './store';
import { useRealEstateMarkers } from './hooks/useRealEstateMarkers';
import { useTileQueries } from './hooks/useTileQueries';
import type { EnrichedProperty, PropertyCluster } from './types';
import {
  enrichPropertiesWithPriceScore,
  filterPropertiesByPriceValue,
  analyzeClusterPrices,
  enrichPropertiesSimplified,
  filterPropertiesByScore,
  filterClustersByScore,
} from './lib';
import { createTimer } from '@/lib/profiling';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';

/**
 * RealEstateController - Self-contained controller for the real estate extension
 * 
 * This component handles all side effects for the real estate extension:
 * 1. Fetching properties using tile-based approach (via useTileQueries)
 * 2. Computing enriched/filtered properties
 * 3. Rendering markers on the map
 * 
 * It returns null (no UI) - it's purely for side effects.
 * This keeps the extension fully self-contained and decoupled from the core.
 */
export function RealEstateController() {
  // Get map state
  const { bounds, zoom, heatmapPoints, gridCellSize, clusterPriceDisplay, clusterPriceAnalysis, detailedModeThreshold, map, leaflet, layerGroup, isMapReady, setExtensionDebugTiles } = useMapStore(
    useShallow((s) => ({
      bounds: s.bounds,
      zoom: s.zoom,
      heatmapPoints: s.heatmapPoints,
      gridCellSize: s.gridCellSize,
      clusterPriceDisplay: s.clusterPriceDisplay,
      clusterPriceAnalysis: s.clusterPriceAnalysis,
      detailedModeThreshold: s.detailedModeThreshold,
      map: s.mapInstance,
      leaflet: s.leafletInstance,
      layerGroup: s.extensionLayerGroup,
      isMapReady: s.isMapReady,
      setExtensionDebugTiles: s.setExtensionDebugTiles,
    }))
  );
  
  // Get real estate state
  const {
    enabled,
    filters,
    scoreRange,
    priceValueRange,
    priceAnalysisRadius,
    clusterPropertiesCache,
    cacheVersion,
    setRawData,
    setComputedData,
    setIsLoading,
    setIsTooLarge,
    setIsBelowMinZoom,
    setError,
    cacheClusterProperties,
    clearProperties,
  } = useRealEstateStore(
    useShallow((s) => ({
      enabled: s.enabled,
      filters: s.filters,
      scoreRange: s.scoreRange,
      priceValueRange: s.priceValueRange,
      priceAnalysisRadius: s.priceAnalysisRadius,
      clusterPropertiesCache: s.clusterPropertiesCache,
      cacheVersion: s.cacheVersion,
      setRawData: s.setRawData,
      setComputedData: s.setComputedData,
      setIsLoading: s.setIsLoading,
      setIsTooLarge: s.setIsTooLarge,
      setIsBelowMinZoom: s.setIsBelowMinZoom,
      setError: s.setError,
      cacheClusterProperties: s.cacheClusterProperties,
      clearProperties: s.clearProperties,
    }))
  );

  // ============================================
  // TILE-BASED FETCHING: Use useTileQueries hook
  // ============================================
  const {
    properties: rawProperties,
    clusters: rawClusters,
    isLoading,
    isTooLarge,
    error,
    tiles: propertyTiles,
    totalCount,
  } = useTileQueries({
    bounds,
    zoom,
    filters,
    priceAnalysisRadius,
    enabled,
  });

  // Check if zoom is below minimum display level
  const isBelowMinZoom = zoom < PROPERTY_TILE_CONFIG.MIN_DISPLAY_ZOOM;

  // Sync tile query state to store
  useEffect(() => {
    setIsLoading(isLoading);
  }, [isLoading, setIsLoading]);

  useEffect(() => {
    setIsTooLarge(isTooLarge);
  }, [isTooLarge, setIsTooLarge]);

  useEffect(() => {
    setIsBelowMinZoom(isBelowMinZoom);
  }, [isBelowMinZoom, setIsBelowMinZoom]);

  useEffect(() => {
    setError(error);
  }, [error, setError]);

  // Sync property tiles to store for debug rendering
  useEffect(() => {
    setExtensionDebugTiles(propertyTiles);
  }, [propertyTiles, setExtensionDebugTiles]);

  // Update raw data in store when tile data changes
  useEffect(() => {
    if (!enabled || isBelowMinZoom) {
      return;
    }
    setRawData(rawProperties, rawClusters, totalCount);
  }, [rawProperties, rawClusters, totalCount, enabled, setRawData, isBelowMinZoom]);

  // Clear properties when disabled or below minimum zoom
  useEffect(() => {
    if (!enabled || isBelowMinZoom) {
      clearProperties();
    }
  }, [enabled, isBelowMinZoom, clearProperties]);

  // ============================================
  // COMPUTED: Enrich and filter properties
  // ============================================
  
  // Combine standalone properties with cached cluster properties for analytics
  const allPropertiesForAnalytics = useMemo(() => {
    void cacheVersion; // Trigger recalculation when cache changes
    if (clusterPropertiesCache.size === 0) {
      return rawProperties;
    }
    const clusterProps = Array.from(clusterPropertiesCache.values()).flat();
    const seen = new Set(rawProperties.map(p => p.id));
    const uniqueClusterProps = clusterProps.filter(p => !seen.has(p.id));
    return [...rawProperties, ...uniqueClusterProps];
  }, [rawProperties, clusterPropertiesCache, cacheVersion]);

  // Enrich properties with price analysis
  const enrichedProperties = useMemo((): EnrichedProperty[] => {
    if (!enabled || allPropertiesForAnalytics.length === 0 || heatmapPoints.length === 0) {
      return allPropertiesForAnalytics.map(p => ({ ...p }));
    }
    const stopTimer = createTimer('realestate:enrichment');
    const result = enrichPropertiesWithPriceScore(allPropertiesForAnalytics, heatmapPoints, gridCellSize);
    stopTimer({ properties: allPropertiesForAnalytics.length, heatmapPoints: heatmapPoints.length });
    return result;
  }, [enabled, allPropertiesForAnalytics, heatmapPoints, gridCellSize]);

  // Get only standalone properties for rendering as markers
  const standaloneEnrichedProperties = useMemo((): EnrichedProperty[] => {
    void cacheVersion;
    if (clusterPropertiesCache.size === 0) {
      return enrichedProperties;
    }
    const standaloneIds = new Set(rawProperties.map(p => p.id));
    return enrichedProperties.filter(p => standaloneIds.has(p.id));
  }, [enrichedProperties, rawProperties, clusterPropertiesCache, cacheVersion]);

  // Filter properties by heatmap score
  const scoreFilteredProperties = useMemo((): EnrichedProperty[] => {
    if (!enabled || (scoreRange[0] === 0 && scoreRange[1] === 100)) {
      return standaloneEnrichedProperties;
    }
    const stopTimer = createTimer('realestate:score-filter');
    const result = filterPropertiesByScore(standaloneEnrichedProperties, heatmapPoints, scoreRange, gridCellSize);
    stopTimer({ before: standaloneEnrichedProperties.length, after: result.length });
    return result;
  }, [enabled, standaloneEnrichedProperties, heatmapPoints, scoreRange, gridCellSize]);

  // Filter properties by price value
  const filteredProperties = useMemo((): EnrichedProperty[] => {
    if (priceValueRange[0] === 0 && priceValueRange[1] === 100) {
      return scoreFilteredProperties;
    }
    return filterPropertiesByPriceValue(scoreFilteredProperties, priceValueRange);
  }, [scoreFilteredProperties, priceValueRange]);

  // Filter clusters by heatmap score
  const filteredClusters = useMemo((): PropertyCluster[] => {
    if (!enabled || (scoreRange[0] === 0 && scoreRange[1] === 100)) {
      return rawClusters;
    }
    return filterClustersByScore(rawClusters, heatmapPoints, scoreRange, gridCellSize);
  }, [enabled, rawClusters, heatmapPoints, scoreRange, gridCellSize]);

  // Calculate cluster price analysis for glow effect
  const clusterAnalysisData = useMemo(() => {
    if (clusterPriceAnalysis === 'off' || !enabled || filteredClusters.length === 0) {
      return new Map();
    }

    const stopTimer = createTimer('realestate:cluster-analysis');

    if (clusterPriceAnalysis === 'simplified') {
      const result = analyzeClusterPrices(filteredClusters, enrichedProperties);
      stopTimer({ mode: 'simplified', clusters: filteredClusters.length, properties: enrichedProperties.length });
      return result;
    }

    if (clusterPriceAnalysis === 'detailed' && heatmapPoints.length > 0) {
      const detailedEnriched = enrichPropertiesSimplified(allPropertiesForAnalytics, heatmapPoints, gridCellSize);
      const result = analyzeClusterPrices(filteredClusters, detailedEnriched);
      stopTimer({ mode: 'detailed', clusters: filteredClusters.length, properties: detailedEnriched.length });
      return result;
    }

    return new Map();
  }, [clusterPriceAnalysis, enabled, filteredClusters, enrichedProperties, allPropertiesForAnalytics, heatmapPoints, gridCellSize]);

  // ============================================
  // EFFECT: Update computed data in store
  // ============================================
  useEffect(() => {
    setComputedData(filteredProperties, filteredClusters, clusterAnalysisData);
  }, [filteredProperties, filteredClusters, clusterAnalysisData, setComputedData]);

  // ============================================
  // EFFECT: Render markers on the map
  // ============================================
  // Only render markers when map is ready
  useRealEstateMarkers({
    L: isMapReady ? leaflet : null,
    map: isMapReady ? map : null,
    layerGroup: isMapReady ? layerGroup : null,
    properties: filteredProperties,
    clusters: filteredClusters,
    enabled,
    filters,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    heatmapPoints,
    gridCellSize,
    clusterPropertiesCache,
    onClusterPropertiesFetched: cacheClusterProperties,
  });

  // No UI - this is a controller component
  return null;
}

export default RealEstateController;
