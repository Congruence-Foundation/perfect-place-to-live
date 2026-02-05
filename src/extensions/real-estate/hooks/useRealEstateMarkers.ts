'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import type { HeatmapPoint, ClusterPriceAnalysisMode } from '@/types';
import type {
  PropertyFilters,
  ClusterPriceDisplay,
} from '../types';
import type {
  UnifiedProperty,
  UnifiedCluster,
  EnrichedUnifiedProperty,
  PriceCategory,
  UnifiedEstateType,
} from '../lib/shared';
import type { ClusterAnalysisMap } from '../lib/price-analysis';
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
  propertyMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  clusterMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  clusterPopupDataRef: React.MutableRefObject<Map<string, EnrichedUnifiedProperty[]>>;
  clusterUpdateLockRef: React.MutableRefObject<Set<string>>;
  currentClusterRequestRef: React.MutableRefObject<string | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

/** Options for updating property markers */
interface PropertyMarkerOptions {
  properties: EnrichedUnifiedProperty[];
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  createPropertyIcon: (
    estateType: UnifiedEstateType,
    priceCategory?: PriceCategory,
    price?: number | null
  ) => L.DivIcon | null;
}

/** Options for updating cluster markers */
interface ClusterMarkerOptions {
  clusters: UnifiedCluster[];
  properties: EnrichedUnifiedProperty[];
  /** All enriched properties (including cluster properties) for enrichment lookup */
  allEnrichedProperties: EnrichedUnifiedProperty[];
  filters: PropertyFilters;
  clusterPriceDisplay: ClusterPriceDisplay;
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  detailedModeThreshold: number;
  heatmapPoints: HeatmapPoint[];
  gridCellSize: number;
  clusterPropertiesCache: Map<string, UnifiedProperty[]>;
  clusterAnalysisData: ClusterAnalysisMap;
  onClusterPropertiesFetched: (clusterId: string, properties: UnifiedProperty[]) => void;
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
  cluster: UnifiedCluster,
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
    source: cluster.source,
    // Gratka-specific: pass URL and bounds for efficient cluster fetching
    clusterUrl: cluster.url,
    clusterBounds: cluster.bounds,
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
  props: EnrichedUnifiedProperty[],
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
): Set<string> {
  const { L, map, layerGroup, propertyMarkersRef } = ctx;
  const { properties, clusterPriceAnalysis, createPropertyIcon } = options;
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:updatePropertyMarkers',message:'Updating property markers',data:{totalProperties:properties.length,gratkaProperties:properties.filter(p=>p.source==='gratka').length,otodomProperties:properties.filter(p=>p.source==='otodom').length,sampleGratka:properties.filter(p=>p.source==='gratka').slice(0,2).map(p=>({id:p.id,lat:p.lat,lng:p.lng,hasCoords:p.lat!==0&&p.lng!==0}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  const stopPropertyMarkersTimer = createTimer('markers:property-markers');
  const currentPropertyIds = new Set<string>();
  let newPropertyMarkers = 0;
  let skippedNoIcon = 0;
  let updatedPropertyMarkers = 0;

  for (const property of properties) {
    currentPropertyIds.add(property.id);

    // Only show price category glow if price analysis is enabled (not 'off')
    const priceCategory = clusterPriceAnalysis !== 'off' ? property.priceAnalysis?.priceCategory : undefined;

    // Check if marker already exists
    const existingMarker = propertyMarkersRef.current.get(property.id);
    if (existingMarker) {
      // Update existing marker's icon to reflect current price analysis mode
      const icon = createPropertyIcon(
        property.estateType,
        priceCategory,
        property.price
      );
      if (icon) {
        existingMarker.setIcon(icon);
        updatedPropertyMarkers++;
      }
      continue;
    }

    newPropertyMarkers++;
    const galleryId = `gallery-${property.id}`;
    const popupContent = generatePropertyPopupHtml(property, galleryId);
    
    const icon = createPropertyIcon(
      property.estateType,
      priceCategory,
      property.price
    );

    if (!icon) {
      skippedNoIcon++;
      continue;
    }

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
    updated: updatedPropertyMarkers,
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
  cluster: UnifiedCluster,
  clusterId: string,
  clusterMarker: L.Marker,
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
    onClusterPropertiesFetched 
  } = options;

  // Acquire lock to prevent race with click fetch
  if (clusterUpdateLockRef.current.has(clusterId)) return;
  clusterUpdateLockRef.current.add(clusterId);

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:fetchClusterPropertiesBackground',message:'Starting background fetch',data:{clusterId,source:cluster.source,hasUrl:!!cluster.url,hasBounds:!!cluster.bounds,count:cluster.count,heatmapPointsCount:heatmapPoints.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'1,2,4'})}).catch(()=>{});
  // #endregion

  try {
    const response = await fetch('/api/properties/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildClusterFetchBody(cluster, filters, BACKGROUND_FETCH_LIMIT)),
      signal: abortControllerRef.current?.signal,
    });

    if (!response.ok) return;

    const data = await response.json() as { properties: UnifiedProperty[]; totalCount: number };
    if (data.properties.length === 0) return;

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:fetchClusterPropertiesBackground:result',message:'Cluster properties fetched',data:{clusterId,source:cluster.source,propertiesCount:data.properties.length,firstProperty:data.properties[0]?{id:data.properties[0].id,price:data.properties[0].price,pricePerMeter:data.properties[0].pricePerMeter,area:data.properties[0].area,lat:data.properties[0].lat,lng:data.properties[0].lng}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'2,3,5'})}).catch(()=>{});
    // #endregion

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
      const { minCategory: newMin, maxCategory: newMax } = getClusterPriceCategories(enrichedFetchedProps);

      // #region agent log
      const enrichedWithAnalysis = enrichedFetchedProps.filter(p => p.priceAnalysis && p.priceAnalysis.priceCategory !== 'no_data');
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:fetchClusterPropertiesBackground:enriched',message:'Cluster properties enriched',data:{clusterId,source:cluster.source,totalEnriched:enrichedFetchedProps.length,withPriceAnalysis:enrichedWithAnalysis.length,heatmapPointsCount:heatmapPoints.length,gridCellSize,newMin,newMax,willShowGlow:!!(newMin||newMax),firstEnriched:enrichedFetchedProps[0]?{id:enrichedFetchedProps[0].id,priceAnalysis:enrichedFetchedProps[0].priceAnalysis}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3-background-fetch'})}).catch(()=>{});
      // #endregion

      const newIcon = createClusterDivIcon(ctx.L, cluster.count, newPriceLabel, newMin, newMax);

      // Update the current marker from the ref (not the passed marker, which may be stale if the marker was recreated)
      const currentMarker = clusterMarkersRef.current.get(clusterId);
      if (currentMarker) {
        currentMarker.setIcon(newIcon);
      }
    }
  } catch (error) {
    // Ignore abort errors - they're expected on unmount
    if (error instanceof Error && error.name === 'AbortError') return;
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
  cluster: UnifiedCluster,
  clusterId: string,
  clusterMarker: L.Marker,
  options: ClusterMarkerOptions
): Promise<void> {
  const { L, map, clusterMarkersRef, propertyMarkersRef, clusterPopupDataRef, clusterUpdateLockRef, currentClusterRequestRef, abortControllerRef } = ctx;
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
    if (currentClusterRequestRef.current !== requestId) {
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to fetch properties (${response.status})`);
    }

    const data = await response.json() as { properties: UnifiedProperty[]; totalCount: number };

    // Check again after parsing response
    if (currentClusterRequestRef.current !== requestId) {
      return;
    }

    if (data.properties.length === 0) {
      clusterMarker.setPopupContent(generateErrorPopupHtml(translations.noOffersFound));
      return;
    }

    onClusterPropertiesFetched(clusterId, data.properties);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:handleClusterClick:beforeEnrich',message:'Before enrichClusterProperties',data:{clusterId,fetchedPropsCount:data.properties.length,allEnrichedPropsCount:allEnrichedProperties.length,sampleFetchedId:data.properties[0]?.id,sampleAllEnrichedId:allEnrichedProperties[0]?.id,allEnrichedWithAnalysis:allEnrichedProperties.filter(p=>p.priceAnalysis&&p.priceAnalysis.priceCategory!=='no_data').length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion

    const enrichedClusterProps = enrichClusterProperties(
      data.properties,
      allEnrichedProperties,
      heatmapPoints,
      gridCellSize
    );

    // #region agent log
    const enrichedWithAnalysis = enrichedClusterProps.filter(p => p.priceAnalysis && p.priceAnalysis.priceCategory !== 'no_data');
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:handleClusterClick:afterEnrich',message:'After enrichClusterProperties',data:{clusterId,enrichedCount:enrichedClusterProps.length,withAnalysisCount:enrichedWithAnalysis.length,sampleEnriched:enrichedClusterProps[0]?{id:enrichedClusterProps[0].id,hasPriceAnalysis:!!enrichedClusterProps[0].priceAnalysis,priceCategory:enrichedClusterProps[0].priceAnalysis?.priceCategory}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2,H4'})}).catch(()=>{});
    // #endregion

    // Update cluster icon
    if (clusterPriceAnalysis !== 'off') {
      const validPrices = getValidPrices(enrichedClusterProps);
      const newPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);
      const { minCategory, maxCategory } = getClusterPriceCategories(enrichedClusterProps);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:handleClusterClick:glowCategories',message:'Glow categories computed',data:{clusterId,minCategory,maxCategory,validPricesCount:validPrices.length,newPriceLabel,willHaveGlow:!!(minCategory||maxCategory)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      
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
    clusterPropertiesCache,
    clusterAnalysisData,
  } = options;

  const stopClusterMarkersTimer = createTimer('markers:cluster-markers');
  const currentClusterIds = new Set<string>();
  let newClusterMarkers = 0;

  // Track which markers need icon updates (existing markers with new cache data)
  let updatedClusterMarkers = 0;

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
        let priceLabel = '';
        let minCategory: PriceCategory | null = null;
        let maxCategory: PriceCategory | null = null;

        // Get price label from cached props
        const validPrices = getValidPrices(cachedClusterProps);
        priceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);

        // Get glow categories from analysis data or enriched props
        // (useDetailedMode already ensures clusterPriceAnalysis === 'detailed')
        const analysisData = clusterAnalysisData?.get(clusterId);
        if (analysisData && analysisData.propertyCount > 0) {
          minCategory = analysisData.minCategory;
          maxCategory = analysisData.maxCategory;
        } else {
          // Fallback: compute from enriched cached props
          const enrichedPropsMap = new Map<string, EnrichedUnifiedProperty>();
          for (const p of properties) {
            enrichedPropsMap.set(p.id, p);
          }
          const enrichedCachedProps = cachedClusterProps
            .map(p => enrichedPropsMap.get(p.id))
            .filter((p): p is EnrichedUnifiedProperty => !!p && !!p.priceAnalysis);

          if (enrichedCachedProps.length > 0) {
            const result = getClusterPriceCategories(enrichedCachedProps);
            minCategory = result.minCategory;
            maxCategory = result.maxCategory;
          }
        }

        // Update the marker icon
        const newIcon = createClusterDivIcon(L, cluster.count, priceLabel, minCategory, maxCategory);
        existingMarker.setIcon(newIcon);
        updatedClusterMarkers++;
      }
      continue;
    }

    newClusterMarkers++;

    // Determine initial price label and glow
    let initialPriceLabel = '';
    let initialMinCategory: PriceCategory | null = null;
    let initialMaxCategory: PriceCategory | null = null;

    // For detailed mode, use pre-computed cluster analysis data for immediate glow
    // For simplified mode, glow only appears after clicking on the cluster
    if (useDetailedMode && clusterAnalysisData) {
      const analysisData = clusterAnalysisData.get(clusterId);
      if (analysisData && analysisData.propertyCount > 0) {
        initialMinCategory = analysisData.minCategory;
        initialMaxCategory = analysisData.maxCategory;
      }
    }

    // #region agent log
    const analysisData = clusterAnalysisData?.get(clusterId);
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useRealEstateMarkers.ts:updateClusterMarkers',message:'Creating cluster marker',data:{clusterId,clusterSource:cluster.source,clusterCount:cluster.count,clusterPriceAnalysis,useDetailedMode,hasCachedProps:!!cachedClusterProps,cachedPropsCount:cachedClusterProps?.length||0,hasClusterAnalysisData:!!clusterAnalysisData,hasAnalysisData:!!analysisData,analysisPropertyCount:analysisData?.propertyCount,analysisMinCat:analysisData?.minCategory,analysisMaxCat:analysisData?.maxCategory,initialMinCategory,initialMaxCategory,willShowGlow:!!(initialMinCategory||initialMaxCategory)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-cross-source'})}).catch(()=>{});
    // #endregion

    // For detailed mode with cached props, also compute price label
    if (useDetailedMode && cachedClusterProps && cachedClusterProps.length > 0) {
      const validPrices = getValidPrices(cachedClusterProps);
      initialPriceLabel = generateClusterPriceLabel(validPrices, clusterPriceDisplay);

      // If we have cached props with enriched data, use those for more accurate categories
      const enrichedPropsMap = new Map<string, EnrichedUnifiedProperty>();
      for (const p of properties) {
        enrichedPropsMap.set(p.id, p);
      }
      const enrichedCachedProps = cachedClusterProps
        .map(p => enrichedPropsMap.get(p.id))
        .filter((p): p is EnrichedUnifiedProperty => !!p && !!p.priceAnalysis);

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
    updated: updatedClusterMarkers,
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

/**
 * Hook for managing real estate markers on the map
 * Handles property markers, cluster markers, and popup interactions
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
  
  // Track previous analysis mode to detect changes
  const prevClusterPriceAnalysisRef = useRef(clusterPriceAnalysis);
  const prevDetailedModeThresholdRef = useRef(detailedModeThreshold);
  
  // Track property price analysis changes
  const prevPropertiesPriceHashRef = useRef<string>('');
  
  // Track current cluster request to prevent race conditions
  const currentClusterRequestRef = useRef<string | null>(null);
  
  // Track cluster icon update locks to prevent background/click fetch races
  const clusterUpdateLockRef = useRef<Set<string>>(new Set());
  
  // AbortController for cancelling in-flight fetch requests on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Create property icon
  const createPropertyIcon = useCallback((
    estateType: UnifiedEstateType,
    priceCategory?: PriceCategory,
    price?: number | null
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
      if (layerGroup) {
        // Clear cluster markers
        if (clusterMarkersRef.current.size > 0) {
          clusterMarkersRef.current.forEach((marker) => {
            layerGroup.removeLayer(marker);
          });
          clusterMarkersRef.current.clear();
        }
        
        // Also clear property markers when analysis mode changes
        // This ensures property glow is updated when switching to/from 'off' mode
        if (propertyMarkersRef.current.size > 0) {
          propertyMarkersRef.current.forEach((marker) => {
            layerGroup.removeLayer(marker);
          });
          propertyMarkersRef.current.clear();
        }
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

    // Create new AbortController for this effect cycle
    abortControllerRef.current = new AbortController();

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
        translations,
      };
      updateClusterMarkers(ctx, clusterOptions);

      stopUpdateTimer({ 
        properties: propertyMarkersRef.current.size, 
        clusters: clusterMarkersRef.current.size 
      });
    };

    updateMarkers();

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
