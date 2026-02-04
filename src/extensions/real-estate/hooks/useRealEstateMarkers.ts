'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import type { HeatmapPoint, ClusterPriceAnalysisMode } from '@/types';
import type {
  EnrichedProperty,
  PropertyCluster,
  PropertyFilters,
  ClusterPriceDisplay,
  OtodomProperty,
  ClusterPropertiesResponse,
  PriceCategory,
  EstateType,
} from '../types';
import { generatePropertyMarkerHtml, getPropertyMarkerClassName } from '../lib';
import {
  generateClusterPriceLabel,
  getClusterPriceCategories,
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
  enrichClusterProperties,
  DEFAULT_CLUSTER_RADIUS,
} from '../utils/enrichment';
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
import { createTimer } from '@/lib/profiling';
import { createClusterId } from '@/lib/geo';

// =============================================================================
// Types
// =============================================================================

/** Context for marker operations */
interface MarkerContext {
  L: typeof import('leaflet');
  map: L.Map;
  layerGroup: L.LayerGroup;
  propertyMarkersRef: React.MutableRefObject<Map<number, L.Marker>>;
  clusterMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  clusterPopupDataRef: React.MutableRefObject<Map<string, EnrichedProperty[]>>;
  clusterUpdateLockRef: React.MutableRefObject<Set<string>>;
  currentClusterRequestRef: React.MutableRefObject<string | null>;
}

/** Options for updating property markers */
interface PropertyMarkerOptions {
  properties: EnrichedProperty[];
  createPropertyIcon: (
    estateType: EstateType,
    priceCategory?: PriceCategory,
    price?: number
  ) => L.DivIcon | null;
}

/** Options for updating cluster markers */
interface ClusterMarkerOptions {
  clusters: PropertyCluster[];
  properties: EnrichedProperty[];
  filters: PropertyFilters;
  clusterPriceDisplay: ClusterPriceDisplay;
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  detailedModeThreshold: number;
  heatmapPoints: HeatmapPoint[];
  gridCellSize: number;
  clusterPropertiesCache: Map<string, OtodomProperty[]>;
  onClusterPropertiesFetched: (clusterId: string, properties: OtodomProperty[]) => void;
  /** Translations for error messages */
  translations: {
    noOffersFound: string;
    loadError: string;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build request body for cluster properties API
 */
function buildClusterFetchBody(
  cluster: PropertyCluster,
  filters: PropertyFilters,
  limit: number
): object {
  return {
    lat: cluster.lat,
    lng: cluster.lng,
    filters,
    page: 1,
    limit: Math.min(cluster.count, limit),
    shape: cluster.shape,
    radius: cluster.radiusInMeters || DEFAULT_CLUSTER_RADIUS,
    estateType: cluster.estateType,
  };
}

/**
 * Attach navigation event listeners to popup buttons
 */
function attachPopupNavigationListeners(
  clusterId: string,
  currentPropertyIndex: { value: number },
  currentImageIndex: { value: number },
  fetchedCount: number,
  props: EnrichedProperty[],
  updatePopup: () => void
): void {
  const prevBtn = document.getElementById(`${clusterId}-prev`);
  const nextBtn = document.getElementById(`${clusterId}-next`);

  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentPropertyIndex.value > 0) {
        currentPropertyIndex.value--;
        currentImageIndex.value = 0;
        updatePopup();
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentPropertyIndex.value < fetchedCount - 1) {
        currentPropertyIndex.value++;
        currentImageIndex.value = 0;
        updatePopup();
      }
    };
  }

  const imgPrevBtn = document.getElementById(`${clusterId}-img-prev`);
  const imgNextBtn = document.getElementById(`${clusterId}-img-next`);
  const currentProperty = props[currentPropertyIndex.value];

  if (imgPrevBtn && currentProperty) {
    imgPrevBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentImageIndex.value > 0) {
        currentImageIndex.value--;
        updatePopup();
      }
    };
  }

  if (imgNextBtn && currentProperty) {
    imgNextBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentImageIndex.value < currentProperty.images.length - 1) {
        currentImageIndex.value++;
        updatePopup();
      }
    };
  }
}

/**
 * Update property markers on the map
 * @returns Set of current property IDs
 */
function updatePropertyMarkers(
  ctx: MarkerContext,
  options: PropertyMarkerOptions
): Set<number> {
  const { L, map, layerGroup, propertyMarkersRef } = ctx;
  const { properties, createPropertyIcon } = options;
  
  const stopPropertyMarkersTimer = createTimer('markers:property-markers');
  const currentPropertyIds = new Set<number>();
  let newPropertyMarkers = 0;

  for (const property of properties) {
    currentPropertyIds.add(property.id);

    // Skip if marker already exists
    if (propertyMarkersRef.current.has(property.id)) {
      continue;
    }

    newPropertyMarkers++;
    const galleryId = `gallery-${property.id}`;
    const popupContent = generatePropertyPopupHtml(property, galleryId);

    const icon = createPropertyIcon(
      property.estate,
      property.priceAnalysis?.priceCategory,
      property.hidePrice ? undefined : property.totalPrice.value
    );

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
      ctx.clusterMarkersRef.current.forEach(cm => cm.closePopup());
      marker.openPopup();
    });

    marker.addTo(layerGroup);
    propertyMarkersRef.current.set(property.id, marker);
  }

  // Remove stale property markers
  let removedPropertyMarkers = 0;
  for (const [id, marker] of propertyMarkersRef.current) {
    if (!currentPropertyIds.has(id)) {
      layerGroup.removeLayer(marker);
      propertyMarkersRef.current.delete(id);
      removedPropertyMarkers++;
    }
  }
  
  stopPropertyMarkersTimer({ 
    new: newPropertyMarkers, 
    removed: removedPropertyMarkers, 
    total: propertyMarkersRef.current.size 
  });

  return currentPropertyIds;
}

/**
 * Fetch cluster properties in background for detailed mode
 */
async function fetchClusterPropertiesBackground(
  ctx: MarkerContext,
  cluster: PropertyCluster,
  clusterId: string,
  clusterMarker: L.Marker,
  options: ClusterMarkerOptions
): Promise<void> {
  const { clusterUpdateLockRef, clusterMarkersRef } = ctx;
  const { 
    filters, 
    properties, 
    heatmapPoints, 
    gridCellSize, 
    clusterPriceDisplay,
    onClusterPropertiesFetched 
  } = options;

  // Acquire lock to prevent race with click fetch
  if (clusterUpdateLockRef.current.has(clusterId)) return;
  clusterUpdateLockRef.current.add(clusterId);

  try {
    const response = await fetch('/api/properties/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildClusterFetchBody(cluster, filters, BACKGROUND_FETCH_LIMIT)),
    });

    if (!response.ok) return;

    const data: ClusterPropertiesResponse = await response.json();
    if (data.properties.length === 0) return;

    onClusterPropertiesFetched(clusterId, data.properties);

    const enrichedFetchedProps = enrichClusterProperties(
      data.properties,
      properties,
      heatmapPoints,
      gridCellSize
    );
    const validPrices = getValidPrices(data.properties);
    const newPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);
    const { minCategory: newMin, maxCategory: newMax } = getClusterPriceCategories(enrichedFetchedProps);

    const newIcon = createClusterDivIcon(ctx.L, cluster.count, newPriceLabel, newMin, newMax);

    if (clusterMarkersRef.current.has(clusterId)) {
      clusterMarker.setIcon(newIcon);
    }
  } catch (error) {
    // Log background fetch errors for debugging
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
  cluster: PropertyCluster,
  clusterId: string,
  clusterMarker: L.Marker,
  options: ClusterMarkerOptions
): Promise<void> {
  const { L, map, clusterMarkersRef, propertyMarkersRef, clusterPopupDataRef, clusterUpdateLockRef, currentClusterRequestRef } = ctx;
  const { 
    filters, 
    properties, 
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
    });

    // Check if this is still the current request (prevent stale updates)
    if (currentClusterRequestRef.current !== requestId) {
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to fetch properties (${response.status})`);
    }

    const data: ClusterPropertiesResponse = await response.json();

    // Check again after parsing response
    if (currentClusterRequestRef.current !== requestId) {
      return;
    }

    if (data.properties.length === 0) {
      clusterMarker.setPopupContent(generateErrorPopupHtml(translations.noOffersFound));
      return;
    }

    onClusterPropertiesFetched(clusterId, data.properties);

    const enrichedClusterProps = enrichClusterProperties(
      data.properties,
      properties,
      heatmapPoints,
      gridCellSize
    );

    // Update cluster icon
    if (clusterPriceAnalysis !== 'off') {
      const validPrices = getValidPrices(enrichedClusterProps);
      const newPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);
      const { minCategory, maxCategory } = getClusterPriceCategories(enrichedClusterProps);
      const newIcon = createClusterDivIcon(L, cluster.count, newPriceLabel, minCategory, maxCategory);
      clusterMarker.setIcon(newIcon);
    }

    // Store for navigation
    clusterPopupDataRef.current.set(clusterId, enrichedClusterProps);

    const actualTotalCount = data.totalCount;
    const fetchedCount = data.properties.length;

    // Use objects to allow mutation in closure
    const currentPropertyIndex = { value: 0 };
    const currentImageIndex = { value: 0 };

    const updatePopup = () => {
      const props = clusterPopupDataRef.current.get(clusterId);
      if (!props || props.length === 0) return;

      const html = generateClusterPropertyPopupHtml(
        props[currentPropertyIndex.value],
        clusterId,
        currentPropertyIndex.value,
        actualTotalCount,
        fetchedCount,
        currentImageIndex.value
      );
      clusterMarker.setPopupContent(html);

      // Attach event listeners after DOM update
      setTimeout(() => {
        attachPopupNavigationListeners(
          clusterId,
          currentPropertyIndex,
          currentImageIndex,
          fetchedCount,
          props,
          updatePopup
        );
      }, POPUP_EVENT_LISTENER_DELAY);
    };

    updatePopup();
  } catch (error) {
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
function updateClusterMarkers(
  ctx: MarkerContext,
  options: ClusterMarkerOptions
): Set<string> {
  const { L, layerGroup, clusterMarkersRef, clusterPopupDataRef } = ctx;
  const { 
    clusters, 
    properties, 
    clusterPriceDisplay, 
    clusterPriceAnalysis, 
    detailedModeThreshold,
    clusterPropertiesCache 
  } = options;

  const stopClusterMarkersTimer = createTimer('markers:cluster-markers');
  const currentClusterIds = new Set<string>();
  let newClusterMarkers = 0;

  for (const cluster of clusters) {
    const clusterId = createClusterId(cluster.lat, cluster.lng);
    currentClusterIds.add(clusterId);

    // Skip if marker already exists
    if (clusterMarkersRef.current.has(clusterId)) {
      continue;
    }

    newClusterMarkers++;

    // Determine initial price label and glow
    let initialPriceLabel = '';
    let initialMinCategory: PriceCategory | null = null;
    let initialMaxCategory: PriceCategory | null = null;

    const cachedClusterProps = clusterPropertiesCache.get(clusterId);
    const useDetailedMode = clusterPriceAnalysis === 'detailed' && cluster.count <= detailedModeThreshold;

    if (useDetailedMode && cachedClusterProps && cachedClusterProps.length > 0) {
      const validPrices = getValidPrices(cachedClusterProps);
      initialPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);

      const enrichedPropsMap = new Map<number, EnrichedProperty>();
      for (const p of properties) {
        enrichedPropsMap.set(p.id, p);
      }
      const enrichedCachedProps = cachedClusterProps
        .map(p => enrichedPropsMap.get(p.id))
        .filter((p): p is EnrichedProperty => !!p && !!p.priceAnalysis);

      if (enrichedCachedProps.length > 0) {
        const result = getClusterPriceCategories(enrichedCachedProps);
        initialMinCategory = result.minCategory;
        initialMaxCategory = result.maxCategory;
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
      fetchClusterPropertiesBackground(ctx, cluster, clusterId, clusterMarker, options);
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
  let removedClusterMarkers = 0;
  for (const [id, marker] of clusterMarkersRef.current) {
    if (!currentClusterIds.has(id)) {
      layerGroup.removeLayer(marker);
      clusterMarkersRef.current.delete(id);
      removedClusterMarkers++;
      // Clean up popup data when removing markers
      clusterPopupDataRef.current.delete(id);
    }
  }
  
  stopClusterMarkersTimer({ 
    new: newClusterMarkers, 
    removed: removedClusterMarkers, 
    total: clusterMarkersRef.current.size 
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
  /** Properties to display */
  properties: EnrichedProperty[];
  /** Property clusters to display */
  clusters: PropertyCluster[];
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
  clusterPropertiesCache: Map<string, OtodomProperty[]>;
  /** Callback when cluster properties are fetched */
  onClusterPropertiesFetched: (clusterId: string, properties: OtodomProperty[]) => void;
  /** Translations for error messages */
  translations: {
    noOffersFound: string;
    loadError: string;
  };
}

/**
 * Hook for managing real estate markers on the map
 * Handles property markers, cluster markers, and popup interactions
 */
export function useRealEstateMarkers({
  L,
  map,
  layerGroup,
  properties,
  clusters,
  enabled,
  filters,
  clusterPriceDisplay,
  clusterPriceAnalysis,
  detailedModeThreshold,
  heatmapPoints,
  gridCellSize,
  clusterPropertiesCache,
  onClusterPropertiesFetched,
  translations,
}: UseRealEstateMarkersOptions) {
  // Refs for tracking markers
  const propertyMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  
  // Ref for storing cluster popup data (replaces window object storage)
  const clusterPopupDataRef = useRef<Map<string, EnrichedProperty[]>>(new Map());
  
  // Track previous analysis mode to detect changes
  const prevClusterPriceAnalysisRef = useRef(clusterPriceAnalysis);
  const prevDetailedModeThresholdRef = useRef(detailedModeThreshold);
  
  // Track property price analysis changes
  const prevPropertiesPriceHashRef = useRef<string>('');
  
  // Track current cluster request to prevent race conditions
  const currentClusterRequestRef = useRef<string | null>(null);
  
  // Track cluster icon update locks to prevent background/click fetch races
  const clusterUpdateLockRef = useRef<Set<string>>(new Set());

  // Create property icon
  const createPropertyIcon = useCallback((
    estateType: EstateType,
    priceCategory?: PriceCategory,
    price?: number
  ) => {
    if (!L) return null;
    return L.divIcon({
      className: getPropertyMarkerClassName(estateType, priceCategory),
      html: generatePropertyMarkerHtml(estateType, PROPERTY_ICON_SIZE, priceCategory, price),
      iconSize: [PROPERTY_ICON_SIZE, PROPERTY_ICON_HEIGHT],
      iconAnchor: [PROPERTY_ICON_ANCHOR_X, PROPERTY_ICON_ANCHOR_Y],
      popupAnchor: [0, PROPERTY_POPUP_ANCHOR_Y],
    });
  }, [L]);

  // Clear all markers when analysis mode changes
  useEffect(() => {
    if (
      prevClusterPriceAnalysisRef.current !== clusterPriceAnalysis ||
      prevDetailedModeThresholdRef.current !== detailedModeThreshold
    ) {
      // Only clear if layerGroup is available
      if (layerGroup && clusterMarkersRef.current.size > 0) {
        clusterMarkersRef.current.forEach((marker) => {
          layerGroup.removeLayer(marker);
        });
        clusterMarkersRef.current.clear();
      }
      
      prevClusterPriceAnalysisRef.current = clusterPriceAnalysis;
      prevDetailedModeThresholdRef.current = detailedModeThreshold;
    }
  }, [clusterPriceAnalysis, detailedModeThreshold, layerGroup]);

  // Clear property markers when price analysis changes
  useEffect(() => {
    const priceHash = properties
      .map(p => `${p.id}:${p.priceAnalysis?.priceCategory || 'none'}`)
      .sort()
      .join(',');
    
    if (prevPropertiesPriceHashRef.current && prevPropertiesPriceHashRef.current !== priceHash) {
      // Only clear if layerGroup is available
      if (layerGroup && propertyMarkersRef.current.size > 0) {
        propertyMarkersRef.current.forEach((marker) => {
          layerGroup.removeLayer(marker);
        });
        propertyMarkersRef.current.clear();
      }
    }
    
    prevPropertiesPriceHashRef.current = priceHash;
  }, [properties, layerGroup]);

  // Main effect for updating markers
  useEffect(() => {
    if (!L || !map || !layerGroup) return;

    const updateMarkers = () => {
      const stopUpdateTimer = createTimer('markers:update-total');
      
      // Hide layer if not enabled
      if (!enabled) {
        // Clean up popup data when clearing markers
        clusterPopupDataRef.current.clear();
        layerGroup.clearLayers();
        propertyMarkersRef.current.clear();
        clusterMarkersRef.current.clear();
        stopUpdateTimer({ enabled: false });
        return;
      }

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
      };

      // Update property markers
      updatePropertyMarkers(ctx, {
        properties,
        createPropertyIcon,
      });

      // Update cluster markers
      const clusterOptions: ClusterMarkerOptions = {
        clusters,
        properties,
        filters,
        clusterPriceDisplay,
        clusterPriceAnalysis,
        detailedModeThreshold,
        heatmapPoints,
        gridCellSize,
        clusterPropertiesCache,
        onClusterPropertiesFetched,
        translations,
      };
      updateClusterMarkers(ctx, clusterOptions);

      stopUpdateTimer({ 
        properties: propertyMarkersRef.current.size, 
        clusters: clusterMarkersRef.current.size 
      });
    };

    updateMarkers();
  }, [
    L,
    map,
    layerGroup,
    properties,
    clusters,
    enabled,
    filters,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    heatmapPoints,
    gridCellSize,
    // Note: clusterPropertiesCache is a ref, so we don't include it here
    // The cache is read inside the effect but doesn't trigger re-runs
    onClusterPropertiesFetched,
    createPropertyIcon,
    translations,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up popup data when unmounting
      clusterPopupDataRef.current.clear();
      propertyMarkersRef.current.clear();
      clusterMarkersRef.current.clear();
    };
  }, []);

  return {
    propertyMarkersCount: propertyMarkersRef.current.size,
    clusterMarkersCount: clusterMarkersRef.current.size,
  };
}
