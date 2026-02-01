'use client';

import { useEffect, useRef, useCallback } from 'react';
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
  BACKGROUND_FETCH_LIMIT,
  CLICK_FETCH_LIMIT,
} from '../utils/enrichment';

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
}: UseRealEstateMarkersOptions) {
  // Refs for tracking markers
  const propertyMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  
  // Track previous analysis mode to detect changes
  const prevClusterPriceAnalysisRef = useRef(clusterPriceAnalysis);
  const prevDetailedModeThresholdRef = useRef(detailedModeThreshold);
  
  // Track property price analysis changes
  const prevPropertiesPriceHashRef = useRef<string>('');

  // Create property icon
  const createPropertyIcon = useCallback((
    estateType: EstateType,
    priceCategory?: PriceCategory,
    price?: number
  ) => {
    if (!L) return null;
    return L.divIcon({
      className: getPropertyMarkerClassName(estateType, priceCategory),
      html: generatePropertyMarkerHtml(estateType, 28, priceCategory, price),
      iconSize: [28, 44],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28],
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

    const updateMarkers = async () => {
      // Hide layer if not enabled
      if (!enabled) {
        // Clean up window properties when clearing markers
        clusterMarkersRef.current.forEach((_, clusterId) => {
          const windowKey = `__cluster_${clusterId.replace(/[^a-zA-Z0-9]/g, '_')}`;
          delete (window as unknown as Record<string, unknown>)[windowKey];
        });
        layerGroup.clearLayers();
        propertyMarkersRef.current.clear();
        clusterMarkersRef.current.clear();
        return;
      }

      // Track current IDs
      const currentClusterIds = new Set<string>();
      const currentPropertyIds = new Set<number>();

      // Add or update property markers
      for (const property of properties) {
        currentPropertyIds.add(property.id);

        // Skip if marker already exists
        if (propertyMarkersRef.current.has(property.id)) {
          continue;
        }

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
          maxWidth: 280,
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
      for (const [id, marker] of propertyMarkersRef.current) {
        if (!currentPropertyIds.has(id)) {
          layerGroup.removeLayer(marker);
          propertyMarkersRef.current.delete(id);
        }
      }

      // Add cluster markers
      for (const cluster of clusters) {
        const clusterId = `cluster-${cluster.lat.toFixed(6)}-${cluster.lng.toFixed(6)}`;
        currentClusterIds.add(clusterId);

        // Skip if marker already exists
        if (clusterMarkersRef.current.has(clusterId)) {
          continue;
        }

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
          (async () => {
            try {
              const response = await fetch('/api/properties/cluster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  lat: cluster.lat,
                  lng: cluster.lng,
                  filters,
                  page: 1,
                  limit: Math.min(cluster.count, BACKGROUND_FETCH_LIMIT),
                  shape: cluster.shape,
                  radius: cluster.radiusInMeters || DEFAULT_CLUSTER_RADIUS,
                  estateType: cluster.estateType,
                }),
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

              const newIcon = createClusterDivIcon(L, cluster.count, newPriceLabel, newMin, newMax);

              if (clusterMarkersRef.current.has(clusterId)) {
                clusterMarker.setIcon(newIcon);
              }
            } catch {
              // Silently fail background fetch
            }
          })();
        }

        // Click handler for cluster
        clusterMarker.on('click', async () => {
          map.closePopup();
          clusterMarkersRef.current.forEach(cm => {
            if (cm !== clusterMarker) cm.closePopup();
          });
          propertyMarkersRef.current.forEach(pm => pm.closePopup());

          // Show loading popup
          clusterMarker.unbindPopup();
          clusterMarker.bindPopup(generateLoadingPopupHtml(cluster.count), {
            className: 'cluster-popup',
            maxWidth: 300,
            closeOnClick: false,
            autoClose: false,
          }).openPopup();

          try {
            const response = await fetch('/api/properties/cluster', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: cluster.lat,
                lng: cluster.lng,
                filters,
                page: 1,
                limit: Math.min(cluster.count, CLICK_FETCH_LIMIT),
                shape: cluster.shape,
                radius: cluster.radiusInMeters || DEFAULT_CLUSTER_RADIUS,
                estateType: cluster.estateType,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
              throw new Error(errorData.error || `Failed to fetch properties (${response.status})`);
            }

            const data: ClusterPropertiesResponse = await response.json();

            if (data.properties.length === 0) {
              clusterMarker.setPopupContent(generateErrorPopupHtml('Nie znaleziono ofert w tym obszarze'));
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
            const windowKey = `__cluster_${clusterId.replace(/[^a-zA-Z0-9]/g, '_')}`;
            (window as unknown as Record<string, EnrichedProperty[]>)[windowKey] = enrichedClusterProps;

            const actualTotalCount = data.totalCount;
            const fetchedCount = data.properties.length;

            let currentPropertyIndex = 0;
            let currentImageIndex = 0;

            const updatePopup = () => {
              const props = (window as unknown as Record<string, EnrichedProperty[]>)[windowKey];
              if (!props || props.length === 0) return;

              const html = generateClusterPropertyPopupHtml(
                props[currentPropertyIndex],
                clusterId,
                currentPropertyIndex,
                actualTotalCount,
                fetchedCount,
                currentImageIndex
              );
              clusterMarker.setPopupContent(html);

              // Attach event listeners
              setTimeout(() => {
                const prevBtn = document.getElementById(`${clusterId}-prev`);
                const nextBtn = document.getElementById(`${clusterId}-next`);

                if (prevBtn) {
                  prevBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentPropertyIndex > 0) {
                      currentPropertyIndex--;
                      currentImageIndex = 0;
                      updatePopup();
                    }
                  };
                }

                if (nextBtn) {
                  nextBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentPropertyIndex < fetchedCount - 1) {
                      currentPropertyIndex++;
                      currentImageIndex = 0;
                      updatePopup();
                    }
                  };
                }

                const imgPrevBtn = document.getElementById(`${clusterId}-img-prev`);
                const imgNextBtn = document.getElementById(`${clusterId}-img-next`);
                const currentProperty = props[currentPropertyIndex];

                if (imgPrevBtn && currentProperty) {
                  imgPrevBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentImageIndex > 0) {
                      currentImageIndex--;
                      updatePopup();
                    }
                  };
                }

                if (imgNextBtn && currentProperty) {
                  imgNextBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentImageIndex < currentProperty.images.length - 1) {
                      currentImageIndex++;
                      updatePopup();
                    }
                  };
                }
              }, 50);
            };

            updatePopup();
          } catch (error) {
            console.error('Error fetching cluster properties:', error);
            const errorMessage = error instanceof Error ? error.message : 'Błąd ładowania ofert';
            clusterMarker.setPopupContent(generateErrorPopupHtml(errorMessage));
          }
        });

        clusterMarker.addTo(layerGroup);
        clusterMarkersRef.current.set(clusterId, clusterMarker);
      }

      // Remove stale cluster markers
      for (const [id, marker] of clusterMarkersRef.current) {
        if (!currentClusterIds.has(id)) {
          layerGroup.removeLayer(marker);
          clusterMarkersRef.current.delete(id);
          // Clean up window properties when clearing markers
          const windowKey = `__cluster_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;
          delete (window as unknown as Record<string, unknown>)[windowKey];
        }
      }
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
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up window properties when unmounting
      clusterMarkersRef.current.forEach((_, clusterId) => {
        const windowKey = `__cluster_${clusterId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        delete (window as unknown as Record<string, unknown>)[windowKey];
      });
      propertyMarkersRef.current.clear();
      clusterMarkersRef.current.clear();
    };
  }, []);

  return {
    propertyMarkersCount: propertyMarkersRef.current.size,
    clusterMarkersCount: clusterMarkersRef.current.size,
  };
}
