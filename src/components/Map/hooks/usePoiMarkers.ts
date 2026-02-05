'use client';

/**
 * Hook for managing POI (Point of Interest) markers on the map
 * Extracts POI marker rendering logic from MapView for better separation of concerns
 */

import { useEffect, useRef } from 'react';
import type { POI, Factor } from '@/types';
import { POI_COLORS, DEFAULT_FALLBACK_COLOR } from '@/constants';
import {
  POI_MARKER_RADIUS,
  POI_MARKER_BORDER_WIDTH,
  POI_MARKER_BORDER_COLOR,
  POI_MARKER_FILL_OPACITY,
  POI_TOOLTIP_OFFSET_Y,
} from '../constants';

interface UsePoiMarkersOptions {
  mapReady: boolean;
  mapInstance: L.Map | null;
  pois: Record<string, POI[]>;
  showPOIs: boolean;
  factors: Factor[];
}

/**
 * Creates a tooltip content string for a POI marker
 */
function createTooltipContent(poi: POI, factorName: string, color: string): string {
  if (poi.name) {
    return `<strong>${poi.name}</strong><br/><span style="color: ${color}">${factorName}</span>`;
  }
  return `<span style="color: ${color}">${factorName}</span>`;
}

/**
 * Hook to manage POI markers on the map
 * 
 * @param options - Configuration options for POI marker rendering
 */
export function usePoiMarkers({
  mapReady,
  mapInstance,
  pois,
  showPOIs,
  factors,
}: UsePoiMarkersOptions): void {
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Combined effect: initialize layer group and update markers
  // Using a single effect avoids race conditions between initialization and updates
  useEffect(() => {
    if (!mapReady || !mapInstance) return;

    let isActive = true;

    const initAndUpdatePOIs = async () => {
      try {
        const L = (await import('leaflet')).default;
        
        // Safety check: abort if effect was cleaned up
        if (!isActive || !mapInstance) return;

        // Initialize layer group if needed
        if (!poiLayerGroupRef.current) {
          poiLayerGroupRef.current = L.layerGroup().addTo(mapInstance);
        }

        // Clear existing markers
        poiLayerGroupRef.current.clearLayers();
        
        // Skip marker creation if POIs are hidden
        if (!showPOIs) return;

        // Build factor name lookup
        const factorNames: Record<string, string> = {};
        for (const f of factors) {
          factorNames[f.id] = f.name;
        }

        // Create markers for each POI
        for (const [factorId, poiList] of Object.entries(pois)) {
          const color = POI_COLORS[factorId] || DEFAULT_FALLBACK_COLOR;
          const factorName = factorNames[factorId] || factorId;

          for (const poi of poiList) {
            // Safety check: abort if effect was cleaned up during iteration
            if (!isActive || !poiLayerGroupRef.current) return;
            
            const marker = L.circleMarker([poi.lat, poi.lng], {
              radius: POI_MARKER_RADIUS,
              fillColor: color,
              color: POI_MARKER_BORDER_COLOR,
              weight: POI_MARKER_BORDER_WIDTH,
              opacity: 1,
              fillOpacity: POI_MARKER_FILL_OPACITY,
            });

            const tooltipContent = createTooltipContent(poi, factorName, color);
            marker.bindTooltip(tooltipContent, { 
              direction: 'top', 
              offset: [0, POI_TOOLTIP_OFFSET_Y] 
            });
            marker.addTo(poiLayerGroupRef.current);
          }
        }
      } catch (error) {
        console.error('Error updating POI markers:', error);
      }
    };

    initAndUpdatePOIs();

    return () => {
      isActive = false;
      if (poiLayerGroupRef.current) {
        poiLayerGroupRef.current.remove();
        poiLayerGroupRef.current = null;
      }
    };
  }, [mapReady, mapInstance, pois, showPOIs, factors]);
}
