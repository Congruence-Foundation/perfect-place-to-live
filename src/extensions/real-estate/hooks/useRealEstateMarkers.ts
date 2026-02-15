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
import type { MarkerInteractionOptions } from '../lib';
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
  generateSourceBadgeHtml,
  generateLikeButtonHtml,
  getExternalLinkIcon,
  POPUP_COLORS,
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
} from '../utils/marker-helpers';
import { attachPopupNavigationListeners, setupGlobalLikeHandler, type NavigationState } from '../utils/popup-navigation';
import {
  propertyInteractionsSelectors,
  usePropertyInteractionsStore,
} from '../stores/propertyInteractionsStore';

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
  const { properties, clusterPriceAnalysis, createPropertyIcon, popupTranslations } = options;

  const stopTimer = createTimer('markers:property-markers');
  const currentPropertyIds = new Set<string>();
  let newCount = 0;
  let updatedCount = 0;

  for (const property of properties) {
    currentPropertyIds.add(property.id);

    // Only show price category glow if price analysis is enabled (not 'off')
    const priceCategory = clusterPriceAnalysis !== 'off' ? property.priceAnalysis?.priceCategory : undefined;
    
    // Get interaction state (visited/liked)
    const isVisited = propertyInteractionsSelectors.isVisited(property.id);
    const isLiked = propertyInteractionsSelectors.isLiked(property.id);
    const interactionOptions: MarkerInteractionOptions = { isVisited, isLiked };

    // Check if marker already exists
    const existingMarker = propertyMarkersRef.current.get(property.id);
    if (existingMarker) {
      // Update existing marker's icon to reflect current price analysis mode and interaction state
      const icon = createPropertyIcon(property.estateType, priceCategory, property.price, interactionOptions);
      if (icon) {
        existingMarker.setIcon(icon);
      }
      // Note: We don't update popup content here - it will be updated when popup opens
      // This avoids issues with event listeners being lost
      updatedCount++;
      continue;
    }

    newCount++;
    const galleryId = `gallery-${property.id}`;
    const popupContent = generatePropertyPopupHtml(property, galleryId, isLiked, popupTranslations);

    const icon = createPropertyIcon(property.estateType, priceCategory, property.price, interactionOptions);
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
    
    // Mark as visited when popup genuinely closes (user navigates away)
    // Use a timeout to skip transient close/reopen during click cycles
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    
    marker.on('popupopen', () => {
      // Cancel any pending visited-mark if popup reopened quickly
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    });
    
    marker.on('popupclose', () => {
      // Delay marking as visited to allow click -> close -> reopen cycles
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (!propertyInteractionsSelectors.isVisited(property.id)) {
          propertyInteractionsSelectors.markVisited(property.id);
          const currentIsLiked = propertyInteractionsSelectors.isLiked(property.id);
          const newIcon = createPropertyIcon(
            property.estateType,
            priceCategory,
            property.price,
            { isVisited: true, isLiked: currentIsLiked }
          );
          if (newIcon) {
            marker.setIcon(newIcon);
          }
        }
      }, 200);
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
    popupTranslations,
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
  clusterMarker.bindPopup(generateLoadingPopupHtml(cluster.count, popupTranslations), {
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

      const currentProperty = props[navState.propertyIndex];
      const isLiked = propertyInteractionsSelectors.isLiked(currentProperty.id);

      const html = generateClusterPropertyPopupHtml(
        currentProperty,
        clusterId,
        navState.propertyIndex,
        actualTotalCount,
        fetchedCount,
        navState.imageIndex,
        popupTranslations,
        isLiked
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
// Liked Property Markers (Always Visible)
// =============================================================================

/**
 * Update liked property markers that are outside the current viewport
 * These markers are always visible regardless of tile-based fetching
 */
function updateLikedMarkers(
  ctx: MarkerContext & { likedMarkersRef: React.MutableRefObject<Map<string, L.Marker>> },
  options: {
    currentPropertyIds: Set<string>;
    createPropertyIcon: (
      estateType: UnifiedEstateType,
      priceCategory?: PriceCategory,
      price?: number | null,
      interactionOptions?: MarkerInteractionOptions
    ) => L.DivIcon | null;
    popupTranslations?: import('../utils/popups').PropertyPopupTranslations;
  }
): void {
  const { L, map, layerGroup, likedMarkersRef, propertyMarkersRef, clusterMarkersRef } = ctx;
  const { currentPropertyIds, createPropertyIcon, popupTranslations } = options;
  
  // Get all liked properties from store
  const likedProperties = propertyInteractionsSelectors.getLikedProperties();
  const likedIds = Object.keys(likedProperties);
  
  if (likedIds.length === 0) {
    // Clear all liked markers if none are liked
    for (const [, marker] of likedMarkersRef.current) {
      layerGroup.removeLayer(marker);
    }
    likedMarkersRef.current.clear();
    return;
  }
  
  const currentLikedMarkerIds = new Set<string>();
  
  for (const id of likedIds) {
    // Skip if this property is already rendered by the tile-based system
    if (currentPropertyIds.has(id)) {
      // Remove from liked layer if it exists there (avoid duplicates)
      const existingLikedMarker = likedMarkersRef.current.get(id);
      if (existingLikedMarker) {
        layerGroup.removeLayer(existingLikedMarker);
        likedMarkersRef.current.delete(id);
      }
      continue;
    }
    
    currentLikedMarkerIds.add(id);
    
    const propertyData = likedProperties[id];
    if (!propertyData) continue;
    
    // Check if marker already exists in liked layer
    const existingMarker = likedMarkersRef.current.get(id);
    if (existingMarker) {
      // Update icon to ensure it shows liked state (no fade for liked)
      const icon = createPropertyIcon(
        propertyData.estateType,
        undefined, // No price category for liked markers outside viewport
        propertyData.price,
        { isVisited: false, isLiked: true }
      );
      if (icon) {
        existingMarker.setIcon(icon);
      }
      continue;
    }
    
    // Create new marker for liked property (no fade for liked)
    const icon = createPropertyIcon(
      propertyData.estateType,
      undefined,
      propertyData.price,
      { isVisited: false, isLiked: true }
    );
    if (!icon) continue;
    
    const marker = L.marker([propertyData.lat, propertyData.lng], { icon });
    
    // Format price per meter
    const pricePerMeterText = propertyData.pricePerMeter 
      ? `${Math.round(propertyData.pricePerMeter).toLocaleString()} PLN/m²` 
      : '';
    
    // Format details line
    const detailsParts = [
      `${propertyData.area} m²`,
      propertyData.rooms ? `${propertyData.rooms} rooms` : '',
      pricePerMeterText,
    ].filter(Boolean).join(' • ');
    
    // Create popup with image if available
    const imageHtml = propertyData.imageUrl ? `
      <div style="background: ${POPUP_COLORS.BG_LIGHT}; border-radius: 8px 8px 0 0; overflow: hidden;">
        <img 
          src="${propertyData.imageUrl}" 
          alt="" 
          style="width: 100%; height: 120px; object-fit: cover; display: block;" 
          onerror="this.style.display='none'" 
        />
      </div>
    ` : '';
    
    // Unlike button (filled heart since it's liked)
    const unlikeButtonHtml = generateLikeButtonHtml(id, true);
    
    const popupContent = `
      <div style="min-width: 200px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
        ${imageHtml}
        <div style="padding: 12px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <a 
              href="${propertyData.url}" 
              target="_blank" 
              rel="noopener noreferrer"
              style="display: flex; align-items: flex-start; gap: 4px; flex: 1; font-weight: 600; font-size: 13px; line-height: 1.3; color: ${POPUP_COLORS.TEXT_PRIMARY}; text-decoration: none;"
            >
              <span style="flex: 1; max-height: 2.6em; overflow: hidden;">${propertyData.title}</span>
              ${getExternalLinkIcon()}
            </a>
            ${generateSourceBadgeHtml(propertyData.source)}
          </div>
          ${propertyData.price ? `<div style="font-size: 16px; font-weight: 700; color: ${POPUP_COLORS.PRICE_GREEN}; margin-bottom: 8px;">${propertyData.price.toLocaleString()} PLN</div>` : ''}
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="color: ${POPUP_COLORS.TEXT_SECONDARY}; font-size: 12px;">${detailsParts}</div>
            ${unlikeButtonHtml}
          </div>
        </div>
      </div>
    `;
    
    marker.bindPopup(popupContent, {
      maxWidth: 280,
      className: 'property-popup liked-property-popup',
    });
    
    // Click handler
    marker.on('click', (e) => {
      e.originalEvent?.preventDefault();
      map.closePopup();
      clusterMarkersRef.current.forEach(cm => cm.closePopup());
      propertyMarkersRef.current.forEach(pm => pm.closePopup());
      
      // Mark as visited (marker won't fade since it's liked)
      if (!propertyInteractionsSelectors.isVisited(id)) {
        propertyInteractionsSelectors.markVisited(id);
      }
      
      marker.openPopup();
    });
    
    marker.addTo(layerGroup);
    likedMarkersRef.current.set(id, marker);
  }
  
  // Remove stale liked markers (unliked properties)
  for (const [id, marker] of likedMarkersRef.current) {
    if (!currentLikedMarkerIds.has(id)) {
      layerGroup.removeLayer(marker);
      likedMarkersRef.current.delete(id);
    }
  }
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
  /** Translations for property popups (type badges, price categories, etc.) */
  popupTranslations?: import('../utils/popups').PropertyPopupTranslations;
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
  popupTranslations,
}: UseRealEstateMarkersOptions) {
  // Refs for tracking markers
  const propertyMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  
  // Ref for liked property markers (always visible, separate from viewport-based markers)
  const likedMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // Ref for storing cluster popup data (replaces window object storage)
  const clusterPopupDataRef = useRef<Map<string, EnrichedUnifiedProperty[]>>(new Map());

  // Track previous values to detect changes
  const prevClusterPriceAnalysisRef = useRef(clusterPriceAnalysis);
  const prevDetailedModeThresholdRef = useRef(detailedModeThreshold);

  // Track current cluster request to prevent race conditions
  const currentClusterRequestRef = useRef<string | null>(null);

  // Track cluster icon update locks to prevent background/click fetch races
  const clusterUpdateLockRef = useRef<Set<string>>(new Set());

  // AbortController for cancelling in-flight fetch requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Subscribe to liked properties to trigger re-renders when likes change
  const likedPropertiesVersion = usePropertyInteractionsStore(
    (state) => Object.keys(state.likedProperties).length
  );
  
  // Store properties in a ref for the global like handler to access
  const propertiesRef = useRef<EnrichedUnifiedProperty[]>(properties);
  propertiesRef.current = properties;

  // Memoize translations to prevent unnecessary re-renders
  const stableTranslations = useMemo(
    () => translations,
    [translations.noOffersFound, translations.loadError]
  );

  // Create property icon
  const createPropertyIcon = useCallback(
    (estateType: UnifiedEstateType, priceCategory?: PriceCategory, price?: number | null, interactionOptions?: MarkerInteractionOptions) => {
      if (!L) return null;
      return L.divIcon({
        className: getPropertyMarkerClassName(estateType, priceCategory),
        html: generatePropertyMarkerHtml(estateType, PROPERTY_ICON_SIZE, priceCategory, price, interactionOptions),
        iconSize: [PROPERTY_ICON_SIZE, PROPERTY_ICON_HEIGHT],
        iconAnchor: [PROPERTY_ICON_ANCHOR_X, PROPERTY_ICON_ANCHOR_Y],
        popupAnchor: [0, PROPERTY_POPUP_ANCHOR_Y],
      });
    },
    [L]
  );
  
  // Set up global like button handler (event delegation)
  useEffect(() => {
    const getPropertyById = (id: string): EnrichedUnifiedProperty | undefined => {
      // First check standalone properties
      const standaloneProperty = propertiesRef.current.find(p => p.id === id);
      if (standaloneProperty) return standaloneProperty;
      
      // Then check cluster popup data
      for (const props of clusterPopupDataRef.current.values()) {
        const clusterProperty = props.find(p => p.id === id);
        if (clusterProperty) return clusterProperty;
      }
      
      return undefined;
    };
    
    const handleLikeChange = (propertyId: string, newIsLiked: boolean) => {
      // Find the marker and update its icon (only for standalone property markers)
      const marker = propertyMarkersRef.current.get(propertyId);
      if (marker) {
        const property = getPropertyById(propertyId);
        if (property) {
          const isVisited = propertyInteractionsSelectors.isVisited(propertyId);
          const priceCategory = clusterPriceAnalysis !== 'off' ? property.priceAnalysis?.priceCategory : undefined;
          const newIcon = createPropertyIcon(
            property.estateType,
            priceCategory,
            property.price,
            { isVisited, isLiked: newIsLiked }
          );
          if (newIcon) {
            marker.setIcon(newIcon);
          }
          
          // Update popup content
          const galleryId = `gallery-${property.id}`;
          const newPopupContent = generatePropertyPopupHtml(property, galleryId, newIsLiked, popupTranslations);
          marker.setPopupContent(newPopupContent);
        }
      }
      
      // For cluster properties: update the like button appearance in-place
      const btn = document.querySelector(`.property-like-btn[data-property-id="${propertyId}"]`) as HTMLButtonElement | null;
      if (btn) {
        btn.dataset.liked = String(newIsLiked);
        const svg = btn.querySelector('svg');
        if (svg) {
          const heartColor = newIsLiked ? POPUP_COLORS.LIKED_PINK : POPUP_COLORS.TEXT_LIGHT;
          const fillColor = newIsLiked ? POPUP_COLORS.LIKED_PINK : 'none';
          svg.setAttribute('stroke', heartColor);
          svg.setAttribute('fill', fillColor);
        }
      }
    };
    
    setupGlobalLikeHandler(getPropertyById, handleLikeChange);
  }, [createPropertyIcon, clusterPriceAnalysis, popupTranslations]);

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

  // Use a ref to hold the latest values for the main effect.
  // This avoids a large dependency array that Turbopack may incorrectly compile
  // (spreading array/Map deps into the useEffect dependency list, causing
  // "changed size between renders" errors).
  const latestRef = useRef({
    properties,
    allEnrichedProperties,
    clusters,
    filters,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    heatmapPoints,
    gridCellSize,
    clusterPropertiesCache,
    clusterAnalysisData,
    onClusterPropertiesFetched,
    createPropertyIcon,
    stableTranslations,
    popupTranslations,
  });
  latestRef.current = {
    properties,
    allEnrichedProperties,
    clusters,
    filters,
    clusterPriceDisplay,
    clusterPriceAnalysis,
    detailedModeThreshold,
    heatmapPoints,
    gridCellSize,
    clusterPropertiesCache,
    clusterAnalysisData,
    onClusterPropertiesFetched,
    createPropertyIcon,
    stableTranslations,
    popupTranslations,
  };

  // Compute a version counter that changes when any dependency changes.
  // Uses lengths/identities of arrays and Maps to detect changes cheaply.
  const depsVersion = useMemo(() => ({}), [
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
    popupTranslations,
    likedPropertiesVersion, // Trigger re-render when likes change
  ]);

  // Main effect for updating markers — uses a fixed-size dependency array
  useEffect(() => {
    if (!L || !map || !layerGroup) return;

    const {
      properties: curProperties,
      allEnrichedProperties: curAllEnrichedProperties,
      clusters: curClusters,
      filters: curFilters,
      clusterPriceDisplay: curClusterPriceDisplay,
      clusterPriceAnalysis: curClusterPriceAnalysis,
      detailedModeThreshold: curDetailedModeThreshold,
      heatmapPoints: curHeatmapPoints,
      gridCellSize: curGridCellSize,
      clusterPropertiesCache: curClusterPropertiesCache,
      clusterAnalysisData: curClusterAnalysisData,
      onClusterPropertiesFetched: curOnClusterPropertiesFetched,
      createPropertyIcon: curCreatePropertyIcon,
      stableTranslations: curStableTranslations,
      popupTranslations: curPopupTranslations,
    } = latestRef.current;

    // Create new AbortController for this effect cycle
    abortControllerRef.current = new AbortController();

    // Hide layer if not enabled
    if (!enabled) {
      // Clean up popup data when clearing markers
      clusterPopupDataRef.current.clear();
      layerGroup.clearLayers();
      propertyMarkersRef.current.clear();
      clusterMarkersRef.current.clear();
      likedMarkersRef.current.clear();
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
    const currentPropertyIds = updatePropertyMarkers(ctx, {
      properties: curProperties,
      clusterPriceAnalysis: curClusterPriceAnalysis,
      createPropertyIcon: curCreatePropertyIcon,
      popupTranslations: curPopupTranslations,
    });
    
    // Update liked markers (always visible, even outside viewport)
    updateLikedMarkers(
      { ...ctx, likedMarkersRef },
      {
        currentPropertyIds,
        createPropertyIcon: curCreatePropertyIcon,
        popupTranslations: curPopupTranslations,
      }
    );

    // Update cluster markers
    const clusterOptions: ClusterMarkerOptions = {
      clusters: curClusters,
      properties: curProperties,
      allEnrichedProperties: curAllEnrichedProperties,
      filters: curFilters,
      clusterPriceDisplay: curClusterPriceDisplay,
      clusterPriceAnalysis: curClusterPriceAnalysis,
      detailedModeThreshold: curDetailedModeThreshold,
      heatmapPoints: curHeatmapPoints,
      gridCellSize: curGridCellSize,
      clusterPropertiesCache: curClusterPropertiesCache,
      clusterAnalysisData: curClusterAnalysisData ?? new Map(),
      onClusterPropertiesFetched: curOnClusterPropertiesFetched,
      translations: curStableTranslations,
      popupTranslations: curPopupTranslations,
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
  // depsVersion is a new object reference whenever any tracked dependency changes.
  // This keeps the dependency array a fixed size (5 items) regardless of data sizes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L, map, layerGroup, enabled, depsVersion]);
}
