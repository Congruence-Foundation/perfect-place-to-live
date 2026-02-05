'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';

import type { HeatmapPoint, ClusterPriceAnalysisMode } from '@/types';
import { createClusterId } from '@/lib/geo';
import { createTimer } from '@/lib/profiling';
import type { PropertyFilters, ClusterPriceDisplay } from '../types';
import type {
  UnifiedProperty,
  UnifiedCluster,
  EnrichedUnifiedProperty,
  PriceCategory,
  UnifiedEstateType,
} from '../lib/shared';
import type { ClusterAnalysisMap } from '../lib/price-analysis';
import { generatePropertyMarkerHtml, getPropertyMarkerClassName } from '../lib';
import { findMinMaxCategories } from '../lib/price-analysis';
import {
  PROPERTY_ICON_SIZE,
  PROPERTY_ICON_HEIGHT,
  PROPERTY_ICON_ANCHOR_X,
  PROPERTY_ICON_ANCHOR_Y,
  PROPERTY_POPUP_ANCHOR_Y,
  PROPERTY_POPUP_MAX_WIDTH,
  CLUSTER_POPUP_MAX_WIDTH,
  BACKGROUND_FETCH_LIMIT,
  CLICK_FETCH_LIMIT,
  POPUP_EVENT_LISTENER_DELAY,
} from '../config/constants';
import { enrichClusterProperties } from '../utils/enrichment';
import {
  generateClusterPriceLabel,
  createClusterDivIcon,
  getValidPrices,
} from '../utils/markers';
import {
  generatePropertyPopupHtml,
  generateClusterPropertyPopupHtml,
  generateLoadingPopupHtml,
  generateErrorPopupHtml,
} from '../utils/popups';
import {
  type MarkerContext,
  type PropertyMarkerOptions,
  type ClusterMarkerOptions,
  type ClusterPropertiesResponse,
  buildClusterFetchBody,
  computeClusterPriceCategories,
  clearMarkersFromRef,
  buildEnrichedPropsMap,
  computePropertiesPriceHash,
} from '../utils/marker-helpers';
import { attachPopupNavigationListeners, type NavigationState } from '../utils/popup-navigation';

// =============================================================================
// Property Marker Functions
// =============================================================================

/**
 * Update property markers on the map
 * @returns Set of current property IDs
 */
function updatePropertyMarkers(
  ctx: MarkerContext,
  options: PropertyMarkerOptions
): Set<string> {
  const { L, map, layerGroup, propertyMarkersRef, clusterMarkersRef } = ctx;
  const { properties, clusterPriceAnalysis, createPropertyIcon } = options;

  const stopTimer = createTimer('markers:property-markers');
  const currentPropertyIds = new Set<string>();
  let newCount = 0;
  let updatedCount = 0;

  for (const property of properties) {
    currentPropertyIds.add(property.id);

    // Only show price category glow if price analysis is enabled (not 'off')
    const priceCategory = clusterPriceAnalysis !== 'off' ? property.priceAnalysis?.priceCategory : undefined;

    // Check if marker already exists
    const existingMarker = propertyMarkersRef.current.get(property.id);
    if (existingMarker) {
      // Update existing marker's icon to reflect current price analysis mode
      const icon = createPropertyIcon(property.estateType, priceCategory, property.price);
      if (icon) {
        existingMarker.setIcon(icon);
        updatedCount++;
      }
      continue;
    }

    newCount++;
    const galleryId = `gallery-${property.id}`;
    const popupContent = generatePropertyPopupHtml(property, galleryId);

    const icon = createPropertyIcon(property.estateType, priceCategory, property.price);
    if (!icon) continue;

    const marker = L.marker([property.lat, property.lng], { icon });

    marker.bindPopup(popupContent, {
      maxWidth: PROPERTY_POPUP_MAX_WIDTH,
      className: 'property-popup',
    });

    // Click handler to close other popups
    marker.on('click', (e) => {
      e.originalEvent?.preventDefault();
      map.closePopup();
      clusterMarkersRef.current.forEach(cm => cm.closePopup());
      marker.openPopup();
    });

    marker.addTo(layerGroup);
    propertyMarkersRef.current.set(property.id, marker);
  }

  // Remove stale property markers
  let removedCount = 0;
  for (const [id, marker] of propertyMarkersRef.current) {
    if (!currentPropertyIds.has(id)) {
      layerGroup.removeLayer(marker);
      propertyMarkersRef.current.delete(id);
      removedCount++;
    }
  }

  stopTimer({
    new: newCount,
    updated: updatedCount,
    removed: removedCount,
    total: propertyMarkersRef.current.size,
  });

  return currentPropertyIds;
}

// =============================================================================
// Cluster Marker Functions
// =============================================================================

/**
 * Fetch cluster properties in background for detailed mode
 */
async function fetchClusterPropertiesBackground(
  ctx: MarkerContext,
  cluster: UnifiedCluster,
  clusterId: string,
  options: ClusterMarkerOptions
): Promise<void> {
  const { clusterUpdateLockRef, clusterMarkersRef, abortControllerRef } = ctx;
  const {
    filters,
    properties,
    heatmapPoints,
    gridCellSize,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    onClusterPropertiesFetched,
  } = options;

  // Acquire lock to prevent race with click fetch
  if (clusterUpdateLockRef.current.has(clusterId)) return;
  clusterUpdateLockRef.current.add(clusterId);

  try {
    const response = await fetch('/api/properties/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildClusterFetchBody(cluster, filters, BACKGROUND_FETCH_LIMIT)),
      signal: abortControllerRef.current?.signal,
    });

    if (!response.ok) return;

    const data = (await response.json()) as ClusterPropertiesResponse;
    if (data.properties.length === 0) return;

    onClusterPropertiesFetched(clusterId, data.properties);

    // Only update icon with glow if price analysis is enabled
    if (clusterPriceAnalysis !== 'off') {
      const enrichedFetchedProps = enrichClusterProperties(
        data.properties,
        properties,
        heatmapPoints,
        gridCellSize
      );

      const validPrices = getValidPrices(data.properties);
      const newPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);
      const { minCategory, maxCategory } = findMinMaxCategories(enrichedFetchedProps);

      const newIcon = createClusterDivIcon(ctx.L, cluster.count, newPriceLabel, minCategory, maxCategory);

      // Update the current marker from the ref (not the passed marker, which may be stale)
      const currentMarker = clusterMarkersRef.current.get(clusterId);
      if (currentMarker) {
        currentMarker.setIcon(newIcon);
      }
    }
  } catch (error) {
    // Ignore abort errors - they're expected on unmount
    if (error instanceof Error && error.name === 'AbortError') return;
    console.warn('Background cluster fetch failed:', clusterId, error);
  } finally {
    clusterUpdateLockRef.current.delete(clusterId);
  }
}

/**
 * Handle cluster marker click - fetch and display properties
 */
async function handleClusterClick(
  ctx: MarkerContext,
  cluster: UnifiedCluster,
  clusterId: string,
  clusterMarker: L.Marker,
  options: ClusterMarkerOptions
): Promise<void> {
  const {
    L,
    map,
    clusterMarkersRef,
    propertyMarkersRef,
    clusterPopupDataRef,
    clusterUpdateLockRef,
    currentClusterRequestRef,
    abortControllerRef,
  } = ctx;
  const {
    filters,
    allEnrichedProperties,
    heatmapPoints,
    gridCellSize,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    onClusterPropertiesFetched,
    translations,
  } = options;

  // Generate unique request ID to track this specific request
  const requestId = `${clusterId}-${Date.now()}`;
  currentClusterRequestRef.current = requestId;

  // Acquire lock to prevent race with background fetch
  clusterUpdateLockRef.current.add(clusterId);

  map.closePopup();
  clusterMarkersRef.current.forEach(cm => {
    if (cm !== clusterMarker) cm.closePopup();
  });
  propertyMarkersRef.current.forEach(pm => pm.closePopup());

  // Show loading popup
  clusterMarker.unbindPopup();
  clusterMarker.bindPopup(generateLoadingPopupHtml(cluster.count), {
    className: 'cluster-popup',
    maxWidth: CLUSTER_POPUP_MAX_WIDTH,
    closeOnClick: false,
    autoClose: false,
  }).openPopup();

  try {
    const response = await fetch('/api/properties/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildClusterFetchBody(cluster, filters, CLICK_FETCH_LIMIT)),
      signal: abortControllerRef.current?.signal,
    });

    // Check if this is still the current request (prevent stale updates)
    if (currentClusterRequestRef.current !== requestId) return;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to fetch properties (${response.status})`);
    }

    const data = (await response.json()) as ClusterPropertiesResponse;

    // Check again after parsing response
    if (currentClusterRequestRef.current !== requestId) return;

    if (data.properties.length === 0) {
      clusterMarker.setPopupContent(generateErrorPopupHtml(translations.noOffersFound));
      return;
    }

    onClusterPropertiesFetched(clusterId, data.properties);

    const enrichedClusterProps = enrichClusterProperties(
      data.properties,
      allEnrichedProperties,
      heatmapPoints,
      gridCellSize
    );

    // Update cluster icon
    if (clusterPriceAnalysis !== 'off') {
      const validPrices = getValidPrices(enrichedClusterProps);
      const newPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);
      const { minCategory, maxCategory } = findMinMaxCategories(enrichedClusterProps);

      const newIcon = createClusterDivIcon(L, cluster.count, newPriceLabel, minCategory, maxCategory);
      clusterMarker.setIcon(newIcon);
    }

    // Store for navigation
    clusterPopupDataRef.current.set(clusterId, enrichedClusterProps);

    const actualTotalCount = data.totalCount;
    const fetchedCount = data.properties.length;

    // Navigation state object (mutable for closure)
    const navState: NavigationState = { propertyIndex: 0, imageIndex: 0 };

    const updatePopup = () => {
      const props = clusterPopupDataRef.current.get(clusterId);
      if (!props || props.length === 0) return;

      const html = generateClusterPropertyPopupHtml(
        props[navState.propertyIndex],
        clusterId,
        navState.propertyIndex,
        actualTotalCount,
        fetchedCount,
        navState.imageIndex
      );
      clusterMarker.setPopupContent(html);

      // Attach event listeners after DOM update
      setTimeout(() => {
        attachPopupNavigationListeners(clusterId, navState, fetchedCount, props, updatePopup);
      }, POPUP_EVENT_LISTENER_DELAY);
    };

    updatePopup();
  } catch (error) {
    // Ignore abort errors - they're expected on unmount
    if (error instanceof Error && error.name === 'AbortError') return;
    // Only show error if this is still the current request
    if (currentClusterRequestRef.current === requestId) {
      console.error('Error fetching cluster properties:', error);
      const errorMessage = error instanceof Error ? error.message : translations.loadError;
      clusterMarker.setPopupContent(generateErrorPopupHtml(errorMessage));
    }
  } finally {
    clusterUpdateLockRef.current.delete(clusterId);
  }
}

/**
 * Update cluster markers on the map
 * @returns Set of current cluster IDs
 */
function updateClusterMarkers(ctx: MarkerContext, options: ClusterMarkerOptions): Set<string> {
  const { L, layerGroup, clusterMarkersRef, clusterPopupDataRef } = ctx;
  const {
    clusters,
    properties,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    clusterPropertiesCache,
    clusterAnalysisData,
  } = options;

  const stopTimer = createTimer('markers:cluster-markers');
  const currentClusterIds = new Set<string>();
  let newCount = 0;
  let updatedCount = 0;

  // Pre-build enriched properties map once (used for fallback category computation)
  const enrichedPropsMap = buildEnrichedPropsMap(properties);

  for (const cluster of clusters) {
    const clusterId = createClusterId(cluster.lat, cluster.lng);
    currentClusterIds.add(clusterId);

    const cachedClusterProps = clusterPropertiesCache.get(clusterId);
    const useDetailedMode = clusterPriceAnalysis === 'detailed' && cluster.count <= detailedModeThreshold;
    const existingMarker = clusterMarkersRef.current.get(clusterId);

    // If marker already exists, check if we need to update its icon
    if (existingMarker) {
      // Update existing marker if we're in detailed mode and have cached props
      if (useDetailedMode && cachedClusterProps && cachedClusterProps.length > 0) {
        const validPrices = getValidPrices(cachedClusterProps);
        const priceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);

        const { minCategory, maxCategory } = computeClusterPriceCategories(
          clusterId,
          cachedClusterProps,
          enrichedPropsMap,
          clusterAnalysisData
        );

        const newIcon = createClusterDivIcon(L, cluster.count, priceLabel, minCategory, maxCategory);
        existingMarker.setIcon(newIcon);
        updatedCount++;
      }
      continue;
    }

    newCount++;

    // Determine initial price label and glow
    let initialPriceLabel = '';
    let initialMinCategory: PriceCategory | null = null;
    let initialMaxCategory: PriceCategory | null = null;

    // For detailed mode, compute price categories from analysis data or cached props
    if (useDetailedMode) {
      const { minCategory, maxCategory } = computeClusterPriceCategories(
        clusterId,
        cachedClusterProps,
        enrichedPropsMap,
        clusterAnalysisData
      );
      initialMinCategory = minCategory;
      initialMaxCategory = maxCategory;

      // Also compute price label if we have cached props
      if (cachedClusterProps && cachedClusterProps.length > 0) {
        const validPrices = getValidPrices(cachedClusterProps);
        initialPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);
      }
    }

    const clusterIcon = createClusterDivIcon(
      L,
      cluster.count,
      initialPriceLabel,
      initialMinCategory,
      initialMaxCategory
    );

    const clusterMarker = L.marker([cluster.lat, cluster.lng], { icon: clusterIcon });

    // Background fetch for detailed mode
    if (useDetailedMode && !cachedClusterProps) {
      fetchClusterPropertiesBackground(ctx, cluster, clusterId, options);
    }

    // Click handler for cluster
    clusterMarker.on('click', () => {
      handleClusterClick(ctx, cluster, clusterId, clusterMarker, options);
    });

    clusterMarker.addTo(layerGroup);
    clusterMarkersRef.current.set(clusterId, clusterMarker);

    // Clean up popup data when popup closes to prevent memory leaks
    clusterMarker.on('popupclose', () => {
      clusterPopupDataRef.current.delete(clusterId);
    });
  }

  // Remove stale cluster markers
  let removedCount = 0;
  for (const [id, marker] of clusterMarkersRef.current) {
    if (!currentClusterIds.has(id)) {
      layerGroup.removeLayer(marker);
      clusterMarkersRef.current.delete(id);
      removedCount++;
      // Clean up popup data when removing markers
      clusterPopupDataRef.current.delete(id);
    }
  }

  stopTimer({
    new: newCount,
    updated: updatedCount,
    removed: removedCount,
    total: clusterMarkersRef.current.size,
  });

  return currentClusterIds;
}

// =============================================================================
// Hook Types
// =============================================================================

export interface UseRealEstateMarkersOptions {
  /** Leaflet instance */
  L: typeof import('leaflet') | null;
  /** Map instance */
  map: L.Map | null;
  /** Layer group for markers */
  layerGroup: L.LayerGroup | null;
  /** Properties to display (standalone only, for rendering markers) */
  properties: EnrichedUnifiedProperty[];
  /** All enriched properties (including cluster properties) for enrichment lookup */
  allEnrichedProperties: EnrichedUnifiedProperty[];
  /** Property clusters to display */
  clusters: UnifiedCluster[];
  /** Whether to show markers */
  enabled: boolean;
  /** Property filters for API calls */
  filters: PropertyFilters;
  /** Cluster price display mode */
  clusterPriceDisplay: ClusterPriceDisplay;
  /** Cluster price analysis mode */
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  /** Detailed mode threshold */
  detailedModeThreshold: number;
  /** Heatmap points for enrichment */
  heatmapPoints: HeatmapPoint[];
  /** Grid cell size */
  gridCellSize: number;
  /** Cluster properties cache */
  clusterPropertiesCache: Map<string, UnifiedProperty[]>;
  /** Pre-computed cluster analysis data from controller (optional, may be undefined during initial render) */
  clusterAnalysisData?: ClusterAnalysisMap;
  /** Callback when cluster properties are fetched */
  onClusterPropertiesFetched: (clusterId: string, properties: UnifiedProperty[]) => void;
  /** Translations for error messages */
  translations: {
    noOffersFound: string;
    loadError: string;
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing real estate markers on the map.
 * Handles property markers, cluster markers, and popup interactions.
 * 
 * @param options - Configuration options for marker rendering and behavior
 */
export function useRealEstateMarkers({
  L,
  map,
  layerGroup,
  properties,
  allEnrichedProperties,
  clusters,
  enabled,
  filters,
  clusterPriceDisplay,
  clusterPriceAnalysis,
  detailedModeThreshold,
  heatmapPoints,
  gridCellSize,
  clusterPropertiesCache,
  clusterAnalysisData,
  onClusterPropertiesFetched,
  translations,
}: UseRealEstateMarkersOptions) {
  // Refs for tracking markers
  const propertyMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Ref for storing cluster popup data (replaces window object storage)
  const clusterPopupDataRef = useRef<Map<string, EnrichedUnifiedProperty[]>>(new Map());

  // Track previous values to detect changes
  const prevClusterPriceAnalysisRef = useRef(clusterPriceAnalysis);
  const prevDetailedModeThresholdRef = useRef(detailedModeThreshold);
  const prevPropertiesPriceHashRef = useRef<string>('');

  // Track current cluster request to prevent race conditions
  const currentClusterRequestRef = useRef<string | null>(null);

  // Track cluster icon update locks to prevent background/click fetch races
  const clusterUpdateLockRef = useRef<Set<string>>(new Set());

  // AbortController for cancelling in-flight fetch requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize translations to prevent unnecessary re-renders
  const stableTranslations = useMemo(
    () => translations,
    [translations.noOffersFound, translations.loadError]
  );

  // Create property icon
  const createPropertyIcon = useCallback(
    (estateType: UnifiedEstateType, priceCategory?: PriceCategory, price?: number | null) => {
      if (!L) return null;
      return L.divIcon({
        className: getPropertyMarkerClassName(estateType, priceCategory),
        html: generatePropertyMarkerHtml(estateType, PROPERTY_ICON_SIZE, priceCategory, price),
        iconSize: [PROPERTY_ICON_SIZE, PROPERTY_ICON_HEIGHT],
        iconAnchor: [PROPERTY_ICON_ANCHOR_X, PROPERTY_ICON_ANCHOR_Y],
        popupAnchor: [0, PROPERTY_POPUP_ANCHOR_Y],
      });
    },
    [L]
  );

  // Clear all markers when analysis mode or threshold changes
  useEffect(() => {
    const modeChanged = prevClusterPriceAnalysisRef.current !== clusterPriceAnalysis;
    const thresholdChanged = prevDetailedModeThresholdRef.current !== detailedModeThreshold;

    if ((modeChanged || thresholdChanged) && layerGroup) {
      // Clear cluster markers
      clearMarkersFromRef(clusterMarkersRef, layerGroup);

      // Also clear property markers when analysis mode changes
      // This ensures property glow is updated when switching to/from 'off' mode
      clearMarkersFromRef(propertyMarkersRef, layerGroup);

      prevClusterPriceAnalysisRef.current = clusterPriceAnalysis;
      prevDetailedModeThresholdRef.current = detailedModeThreshold;
    }
  }, [clusterPriceAnalysis, detailedModeThreshold, layerGroup]);

  // Clear property markers when price analysis changes
  useEffect(() => {
    // Only compute hash if we have properties and layerGroup
    if (!layerGroup || properties.length === 0) {
      prevPropertiesPriceHashRef.current = '';
      return;
    }

    const priceHash = computePropertiesPriceHash(properties);

    if (prevPropertiesPriceHashRef.current && prevPropertiesPriceHashRef.current !== priceHash) {
      clearMarkersFromRef(propertyMarkersRef, layerGroup);
    }

    prevPropertiesPriceHashRef.current = priceHash;
  }, [properties, layerGroup]);

  // Main effect for updating markers
  useEffect(() => {
    if (!L || !map || !layerGroup) return;

    // Create new AbortController for this effect cycle
    abortControllerRef.current = new AbortController();

    // Hide layer if not enabled
    if (!enabled) {
      // Clean up popup data when clearing markers
      clusterPopupDataRef.current.clear();
      layerGroup.clearLayers();
      propertyMarkersRef.current.clear();
      clusterMarkersRef.current.clear();
      return;
    }

    const stopUpdateTimer = createTimer('markers:update-total');

    // Create marker context for helper functions
    const ctx: MarkerContext = {
      L,
      map,
      layerGroup,
      propertyMarkersRef,
      clusterMarkersRef,
      clusterPopupDataRef,
      clusterUpdateLockRef,
      currentClusterRequestRef,
      abortControllerRef,
    };

    // Update property markers
    updatePropertyMarkers(ctx, {
      properties,
      clusterPriceAnalysis,
      createPropertyIcon,
    });

    // Update cluster markers
    const clusterOptions: ClusterMarkerOptions = {
      clusters,
      properties,
      allEnrichedProperties,
      filters,
      clusterPriceDisplay,
      clusterPriceAnalysis,
      detailedModeThreshold,
      heatmapPoints,
      gridCellSize,
      clusterPropertiesCache,
      clusterAnalysisData: clusterAnalysisData ?? new Map(),
      onClusterPropertiesFetched,
      translations: stableTranslations,
    };
    updateClusterMarkers(ctx, clusterOptions);

    stopUpdateTimer({
      properties: propertyMarkersRef.current.size,
      clusters: clusterMarkersRef.current.size,
    });

    // Cleanup: abort any in-flight requests when effect re-runs or unmounts
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [
    L,
    map,
    layerGroup,
    properties,
    allEnrichedProperties,
    clusters,
    enabled,
    filters,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    heatmapPoints,
    gridCellSize,
    clusterAnalysisData,
    clusterPropertiesCache,
    onClusterPropertiesFetched,
    createPropertyIcon,
    stableTranslations,
  ]);
}
