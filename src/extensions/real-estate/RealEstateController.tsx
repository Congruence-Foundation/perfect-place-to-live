'use client';

import { useEffect, useMemo, useRef } from 'react';

import { useShallow } from 'zustand/react/shallow';
import { useTranslations } from 'next-intl';

import { PROPERTY_TILE_CONFIG } from '@/constants/performance';
import { createClusterId } from '@/lib/geo';
import { createTimer } from '@/lib/profiling';
import { useMapStore } from '@/stores/mapStore';
import type { EnrichedUnifiedProperty, UnifiedCluster, UnifiedProperty } from './lib/shared';
import {
  enrichPropertiesWithPriceScore,
  filterPropertiesByPriceValue,
  analyzeClusterPrices,
  analyzeClusterPricesFromCache,
  enrichPropertiesSimplified,
  filterPropertiesByScore,
  filterClustersByScore,
  hasHeatmapVariation,
} from './lib';
import { useRealEstateMarkers } from './hooks/useRealEstateMarkers';
import { useTileQueries } from './hooks/useTileQueries';
import { useRealEstateStore, useRealEstateHydrated } from './store';
import { usePropertyInteractionsStore } from './stores/propertyInteractionsStore';
import {
  DETAILED_MODE_CLUSTER_FETCH_LIMIT,
  CLUSTER_FETCH_BATCH_SIZE,
  CLUSTER_FETCH_BATCH_DELAY_MS,
  CACHE_FLUSH_INTERVAL,
  CLUSTER_CHANGE_THRESHOLD,
} from './config/constants';

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
 * 
 * Now supports multiple data sources (Otodom, Gratka) via the dataSources state.
 */
export function RealEstateController() {
  // Get translations
  const t = useTranslations('realEstate.popup');
  
  // Get map state
  const { bounds, zoom, heatmapPoints, gridCellSize, clusterPriceDisplay, clusterPriceAnalysis, detailedModeThreshold, map, leaflet, layerGroup, isMapReady, setExtensionDebugTiles, setAnalyticsProgress } = useMapStore(
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
      setAnalyticsProgress: s.setAnalyticsProgress,
    }))
  );
  
  // Get real estate state
  const {
    enabled,
    filters,
    scoreRange,
    priceValueRange,
    priceAnalysisRadius,
    dataSources,
    clusterPropertiesCache,
    cacheVersion,
    setRawData,
    setComputedData,
    setIsLoading,
    setIsTooLarge,
    setIsBelowMinZoom,
    setError,
    cacheClusterProperties,
    cacheClusterPropertiesBatch,
    clearProperties,
  } = useRealEstateStore(
    useShallow((s) => ({
      enabled: s.enabled,
      filters: s.filters,
      scoreRange: s.scoreRange,
      priceValueRange: s.priceValueRange,
      priceAnalysisRadius: s.priceAnalysisRadius,
      dataSources: s.dataSources,
      clusterPropertiesCache: s.clusterPropertiesCache,
      cacheVersion: s.cacheVersion,
      setRawData: s.setRawData,
      setComputedData: s.setComputedData,
      setIsLoading: s.setIsLoading,
      setIsTooLarge: s.setIsTooLarge,
      setIsBelowMinZoom: s.setIsBelowMinZoom,
      setError: s.setError,
      cacheClusterProperties: s.cacheClusterProperties,
      cacheClusterPropertiesBatch: s.cacheClusterPropertiesBatch,
      clearProperties: s.clearProperties,
    }))
  );
  
  // Wait for store hydration before enabling queries
  const hasHydrated = useRealEstateHydrated();

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
    enabled: enabled && hasHydrated, // Only enable after hydration
    dataSources,
  });

  // Check if zoom is below minimum display level
  const isBelowMinZoom = zoom < PROPERTY_TILE_CONFIG.MIN_DISPLAY_ZOOM;

  // Sync tile query state to store (batched to reduce re-renders)
  useEffect(() => {
    setIsLoading(isLoading);
    setIsTooLarge(isTooLarge);
    setIsBelowMinZoom(isBelowMinZoom);
    setError(error);
  }, [isLoading, isTooLarge, isBelowMinZoom, error, setIsLoading, setIsTooLarge, setIsBelowMinZoom, setError]);

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
  // DETAILED MODE: Batch fetch all cluster properties
  // ============================================
  const batchFetchAbortRef = useRef<AbortController | null>(null);
  const batchFetchInProgressRef = useRef<Set<string>>(new Set());
  const fetchedClusterIdsRef = useRef<Set<string>>(new Set());

  // Batch fetch cluster properties for detailed mode
  useEffect(() => {
    // Only fetch in detailed mode when we have clusters and heatmap data
    if (clusterPriceAnalysis !== 'detailed' || !enabled || rawClusters.length === 0 || heatmapPoints.length === 0) {
      return;
    }

    // Find clusters that need fetching (not already fetched and not in progress)
    const clustersToFetch = rawClusters.filter(cluster => {
      const clusterId = createClusterId(cluster.lat, cluster.lng);
      return !fetchedClusterIdsRef.current.has(clusterId) && 
             !batchFetchInProgressRef.current.has(clusterId) &&
             cluster.count <= detailedModeThreshold; // Only fetch small clusters
    });

    if (clustersToFetch.length === 0) {
      return;
    }

    // Cancel any previous batch fetch (only if clusters changed significantly)
    if (batchFetchAbortRef.current) {
      batchFetchAbortRef.current.abort();
    }
    const abortController = new AbortController();
    batchFetchAbortRef.current = abortController;

    // Batch fetch with concurrency limit - returns result or null
    const fetchCluster = async (cluster: UnifiedCluster): Promise<{ clusterId: string; properties: UnifiedProperty[] } | null> => {
      const clusterId = createClusterId(cluster.lat, cluster.lng);
      
      // Mark as in progress
      batchFetchInProgressRef.current.add(clusterId);
      // Mark as fetched immediately to prevent re-fetching
      fetchedClusterIdsRef.current.add(clusterId);

      try {
        const response = await fetch('/api/properties/cluster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: cluster.lat,
            lng: cluster.lng,
            filters,
            limit: DETAILED_MODE_CLUSTER_FETCH_LIMIT,
            source: cluster.source,
            clusterUrl: cluster.url,
            clusterBounds: cluster.bounds,
            radius: cluster.radiusInMeters,
            shape: cluster.shape,
            estateType: cluster.estateType,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) return null;

        const data = await response.json() as { properties: UnifiedProperty[] };
        if (data.properties.length === 0) return null;
        
        return { clusterId, properties: data.properties };
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === 'AbortError') {
          // Remove from fetched so it can be retried
          fetchedClusterIdsRef.current.delete(clusterId);
        }
        // On other errors, keep in fetched to avoid infinite retries
        return null;
      } finally {
        batchFetchInProgressRef.current.delete(clusterId);
      }
    };

    // Process in batches with periodic flush for progressive UI updates
    const processBatches = async () => {
      let pendingResults: Array<{ clusterId: string; properties: UnifiedProperty[] }> = [];
      let batchCount = 0;
      let processedClusters = 0;
      const totalClusters = clustersToFetch.length;
      
      // Show progress indicator
      setAnalyticsProgress(0);
      
      for (let i = 0; i < clustersToFetch.length; i += CLUSTER_FETCH_BATCH_SIZE) {
        if (abortController.signal.aborted) break;
        
        const batch = clustersToFetch.slice(i, i + CLUSTER_FETCH_BATCH_SIZE);
        const results = await Promise.all(batch.map(fetchCluster));
        
        // Collect valid results
        const validResults = results.filter((r): r is { clusterId: string; properties: UnifiedProperty[] } => 
          r !== null && r.properties.length > 0
        );
        pendingResults.push(...validResults);
        batchCount++;
        processedClusters += batch.length;
        
        // Update progress
        const progress = Math.round((processedClusters / totalClusters) * 100);
        setAnalyticsProgress(progress);
        
        // Flush every N batches for progressive UI updates
        if (batchCount >= CACHE_FLUSH_INTERVAL && pendingResults.length > 0) {
          cacheClusterPropertiesBatch(pendingResults);
          pendingResults = [];
          batchCount = 0;
        }
        
        // Small delay between batches to avoid overwhelming the server
        if (i + CLUSTER_FETCH_BATCH_SIZE < clustersToFetch.length && !abortController.signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, CLUSTER_FETCH_BATCH_DELAY_MS));
        }
      }
      
      // Final flush for remaining results
      if (pendingResults.length > 0) {
        cacheClusterPropertiesBatch(pendingResults);
      }
      
      // Clear progress indicator
      setAnalyticsProgress(null);
    };

    processBatches();

    return () => {
      abortController.abort();
      setAnalyticsProgress(null); // Clear progress on abort
    };
  }, [clusterPriceAnalysis, enabled, rawClusters, heatmapPoints.length, detailedModeThreshold, filters, cacheClusterPropertiesBatch, setAnalyticsProgress]);

  // Clear fetched cluster IDs when clusters change significantly (e.g., viewport change)
  const prevRawClustersLengthRef = useRef(0);
  useEffect(() => {
    // If clusters changed significantly, clear the fetched set to allow re-fetching
    if (Math.abs(rawClusters.length - prevRawClustersLengthRef.current) > CLUSTER_CHANGE_THRESHOLD) {
      fetchedClusterIdsRef.current.clear();
    }
    prevRawClustersLengthRef.current = rawClusters.length;
  }, [rawClusters.length]);

  // ============================================
  // COMPUTED: Enrich and filter properties
  // ============================================
  
  // Combine standalone properties with cached cluster properties for analytics
  // Note: cacheVersion is used to trigger recalculation since Map reference doesn't change
  const allPropertiesForAnalytics = useMemo(() => {
    void cacheVersion;
    if (clusterPropertiesCache.size === 0) {
      return rawProperties;
    }
    const clusterProps = Array.from(clusterPropertiesCache.values()).flat();
    const seen = new Set(rawProperties.map(p => p.id));
    const uniqueClusterProps = clusterProps.filter(p => !seen.has(p.id));
    return [...rawProperties, ...uniqueClusterProps];
  }, [rawProperties, clusterPropertiesCache, cacheVersion]);

  // Enrich properties with price analysis
  const enrichedProperties = useMemo((): EnrichedUnifiedProperty[] => {
    if (!enabled || allPropertiesForAnalytics.length === 0 || heatmapPoints.length === 0) {
      return allPropertiesForAnalytics.map(p => ({ ...p }));
    }
    const stopTimer = createTimer('realestate:enrichment');
    const result = enrichPropertiesWithPriceScore(allPropertiesForAnalytics, heatmapPoints, gridCellSize);
    stopTimer({ properties: allPropertiesForAnalytics.length, heatmapPoints: heatmapPoints.length });
    return result;
  }, [enabled, allPropertiesForAnalytics, heatmapPoints, gridCellSize]);

  // Get only standalone properties for rendering as markers
  // Note: cacheVersion is used to trigger recalculation since Map reference doesn't change
  const standaloneEnrichedProperties = useMemo((): EnrichedUnifiedProperty[] => {
    void cacheVersion;
    if (clusterPropertiesCache.size === 0) {
      return enrichedProperties;
    }
    const standaloneIds = new Set(rawProperties.map(p => p.id));
    return enrichedProperties.filter(p => standaloneIds.has(p.id));
  }, [enrichedProperties, rawProperties, clusterPropertiesCache, cacheVersion]);

  // Filter properties by heatmap score
  const scoreFilteredProperties = useMemo((): EnrichedUnifiedProperty[] => {
    if (!enabled || (scoreRange[0] === 0 && scoreRange[1] === 100)) {
      return standaloneEnrichedProperties;
    }
    
    // Skip score filtering if heatmap data is invalid (no variation in K values)
    if (heatmapPoints.length > 0 && !hasHeatmapVariation(heatmapPoints)) {
      return standaloneEnrichedProperties;
    }
    
    const stopTimer = createTimer('realestate:score-filter');
    const result = filterPropertiesByScore(standaloneEnrichedProperties, heatmapPoints, scoreRange, gridCellSize);
    stopTimer({ before: standaloneEnrichedProperties.length, after: result.length });
    return result;
  }, [enabled, standaloneEnrichedProperties, heatmapPoints, scoreRange, gridCellSize]);

  // Filter properties by price value
  const filteredProperties = useMemo((): EnrichedUnifiedProperty[] => {
    if (priceValueRange[0] === 0 && priceValueRange[1] === 100) {
      return scoreFilteredProperties;
    }
    return filterPropertiesByPriceValue(scoreFilteredProperties, priceValueRange);
  }, [scoreFilteredProperties, priceValueRange]);

  // Filter clusters by heatmap score
  const filteredClusters = useMemo((): UnifiedCluster[] => {
    if (!enabled || (scoreRange[0] === 0 && scoreRange[1] === 100)) {
      return rawClusters;
    }
    
    // Skip score filtering if heatmap data is invalid (no variation in K values)
    if (heatmapPoints.length > 0 && !hasHeatmapVariation(heatmapPoints)) {
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
      // Simplified mode: use distance-based matching with nearby properties
      const result = analyzeClusterPrices(filteredClusters, enrichedProperties);
      stopTimer({ mode: 'simplified', clusters: filteredClusters.length, properties: enrichedProperties.length });
      return result;
    }

    if (clusterPriceAnalysis === 'detailed' && heatmapPoints.length > 0) {
      // Detailed mode: use actual cached cluster properties
      // First enrich all properties (including cached cluster properties)
      const detailedEnriched = enrichPropertiesSimplified(allPropertiesForAnalytics, heatmapPoints, gridCellSize);
      // Then analyze using the cache to match properties to their clusters
      const result = analyzeClusterPricesFromCache(filteredClusters, detailedEnriched, clusterPropertiesCache);
      stopTimer({ mode: 'detailed', clusters: filteredClusters.length, properties: detailedEnriched.length, cacheSize: clusterPropertiesCache.size });
      return result;
    }

    return new Map();
  }, [clusterPriceAnalysis, enabled, filteredClusters, enrichedProperties, allPropertiesForAnalytics, heatmapPoints, gridCellSize, clusterPropertiesCache]);

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
  const markerTranslations = useMemo(() => ({
    noOffersFound: t('noOffersFound'),
    loadError: t('loadError'),
  }), [t]);

  const popupTranslations = useMemo(() => ({
    house: t('house'),
    flat: t('flat'),
    priceNegotiable: t('priceNegotiable'),
    rooms: t('rooms'),
    loadingOffers: t('loadingOffers', { count: '{count}' }),
    noOffersFound: t('noOffersFound'),
    similar: t('similar'),
    priceCategoryGreatDeal: t('priceCategoryGreatDeal'),
    priceCategoryGoodDeal: t('priceCategoryGoodDeal'),
    priceCategoryFair: t('priceCategoryFair'),
    priceCategoryAboveAvg: t('priceCategoryAboveAvg'),
    priceCategoryOverpriced: t('priceCategoryOverpriced'),
  }), [t]);

  useRealEstateMarkers({
    L: isMapReady ? leaflet : null,
    map: isMapReady ? map : null,
    layerGroup: isMapReady ? layerGroup : null,
    properties: filteredProperties,
    allEnrichedProperties: enrichedProperties,
    clusters: filteredClusters,
    enabled,
    filters,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    heatmapPoints,
    gridCellSize,
    clusterPropertiesCache,
    clusterAnalysisData,
    onClusterPropertiesFetched: cacheClusterProperties,
    translations: markerTranslations,
    popupTranslations,
  });

  // No UI - this is a controller component
  return null;
}
