'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMapStore } from '@/stores/mapStore';
import { useRealEstateStore } from './store';
import { useRealEstateMarkers } from './hooks/useRealEstateMarkers';
import { isBoundsTooLarge } from '@/lib/geo';
import type { Bounds } from '@/types';
import type { PropertyFilters, EnrichedProperty, PropertyCluster } from './types';
import { DEFAULT_PROPERTY_FILTERS } from './types';
import {
  enrichPropertiesWithPriceScore,
  filterPropertiesByPriceValue,
  analyzeClusterPrices,
  enrichPropertiesSimplified,
  filterPropertiesByScore,
  filterClustersByScore,
} from './lib';

/**
 * RealEstateController - Self-contained controller for the real estate extension
 * 
 * This component handles all side effects for the real estate extension:
 * 1. Fetching properties when bounds/filters change
 * 2. Computing enriched/filtered properties
 * 3. Rendering markers on the map
 * 
 * It returns null (no UI) - it's purely for side effects.
 * This keeps the extension fully self-contained and decoupled from the core.
 */
export function RealEstateController() {
  // Get map state
  const { bounds, heatmapPoints, gridCellSize, clusterPriceDisplay, clusterPriceAnalysis, detailedModeThreshold } = useMapStore(
    useShallow((s) => ({
      bounds: s.bounds,
      heatmapPoints: s.heatmapPoints,
      gridCellSize: s.gridCellSize,
      clusterPriceDisplay: s.clusterPriceDisplay,
      clusterPriceAnalysis: s.clusterPriceAnalysis,
      detailedModeThreshold: s.detailedModeThreshold,
    }))
  );
  
  const { map, L, layerGroup, isMapReady } = useMapStore(
    useShallow((s) => ({
      map: s.mapInstance,
      L: s.leafletInstance,
      layerGroup: s.extensionLayerGroup,
      isMapReady: s.isMapReady,
    }))
  );
  
  // Get real estate state
  const {
    enabled,
    filters,
    scoreRange,
    priceValueRange,
    rawProperties,
    rawClusters,
    clusterPropertiesCache,
    cacheVersion,
    fetchProperties,
    clearProperties,
    setComputedData,
    cacheClusterProperties,
  } = useRealEstateStore(
    useShallow((s) => ({
      enabled: s.enabled,
      filters: s.filters,
      scoreRange: s.scoreRange,
      priceValueRange: s.priceValueRange,
      rawProperties: s.rawProperties,
      rawClusters: s.rawClusters,
      clusterPropertiesCache: s.clusterPropertiesCache,
      cacheVersion: s.cacheVersion,
      fetchProperties: s.fetchProperties,
      clearProperties: s.clearProperties,
      setComputedData: s.setComputedData,
      cacheClusterProperties: s.cacheClusterProperties,
    }))
  );
  
  // Refs for tracking previous values (for fetch logic)
  const prevBoundsRef = useRef<Bounds | null>(null);
  const prevFiltersRef = useRef<PropertyFilters>(DEFAULT_PROPERTY_FILTERS);
  const prevEnabledRef = useRef(false);

  // ============================================
  // EFFECT 1: Fetch properties when bounds/filters change
  // ============================================
  useEffect(() => {
    const justEnabled = enabled && !prevEnabledRef.current;
    prevEnabledRef.current = enabled;
    
    if (!enabled || !bounds) {
      if (!enabled && prevBoundsRef.current !== null) {
        clearProperties();
      }
      prevBoundsRef.current = bounds;
      return;
    }

    if (isBoundsTooLarge(bounds)) {
      return;
    }

    const boundsChanged = !prevBoundsRef.current || 
      bounds.north !== prevBoundsRef.current.north ||
      bounds.south !== prevBoundsRef.current.south ||
      bounds.east !== prevBoundsRef.current.east ||
      bounds.west !== prevBoundsRef.current.west;
    
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(prevFiltersRef.current);

    if (boundsChanged || filtersChanged || justEnabled) {
      fetchProperties(bounds);
      prevBoundsRef.current = bounds;
      prevFiltersRef.current = filters;
    }
  }, [bounds, enabled, filters, fetchProperties, clearProperties]);

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
    return enrichPropertiesWithPriceScore(allPropertiesForAnalytics, heatmapPoints, gridCellSize);
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
    return filterPropertiesByScore(standaloneEnrichedProperties, heatmapPoints, scoreRange, gridCellSize);
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

    if (clusterPriceAnalysis === 'simplified') {
      return analyzeClusterPrices(filteredClusters, enrichedProperties);
    }

    if (clusterPriceAnalysis === 'detailed' && heatmapPoints.length > 0) {
      const detailedEnriched = enrichPropertiesSimplified(allPropertiesForAnalytics, heatmapPoints, gridCellSize);
      return analyzeClusterPrices(filteredClusters, detailedEnriched);
    }

    return new Map();
  }, [clusterPriceAnalysis, enabled, filteredClusters, enrichedProperties, allPropertiesForAnalytics, heatmapPoints, gridCellSize]);

  // ============================================
  // EFFECT 2: Update computed data in store
  // ============================================
  useEffect(() => {
    setComputedData(filteredProperties, filteredClusters, clusterAnalysisData);
  }, [filteredProperties, filteredClusters, clusterAnalysisData, setComputedData]);

  // ============================================
  // EFFECT 3: Render markers on the map
  // ============================================
  // Only render markers when map is ready
  useRealEstateMarkers({
    L: isMapReady ? L : null,
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
