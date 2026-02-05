'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';

import type { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import { Z_INDEX } from '@/constants';
import { useLatestRef } from '@/hooks';
import { calculateFactorBreakdown } from '@/lib/scoring';
import { useMapStore } from '@/stores/mapStore';
import {
  generatePopupContent,
  defaultPopupTranslations,
  type PopupTranslations,
  type FactorTranslations,
} from './utils/popupContent';
import { setupTouchLongPress, setupMouseLongPress } from './hooks/useLongPress';
import { useTileBorders } from './hooks/useTileBorders';
import { useHeatmapOverlay } from './hooks/useHeatmapOverlay';
import { usePoiMarkers } from './hooks/usePoiMarkers';
import {
  MAP_INIT_DELAY_MS,
  FLY_TO_DURATION,
  FIT_BOUNDS_DURATION,
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING,
  LEAFLET_ICON_URLS,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
} from './constants';

// Re-export types for backward compatibility
export type { PopupTranslations, FactorTranslations };

export interface MapViewRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (bounds: Bounds) => void;
  invalidateSize: () => void;
  getMap: () => L.Map | null;
  getExtensionLayerGroup: () => L.LayerGroup | null;
  getLeaflet: () => typeof import('leaflet') | null;
}

interface MapViewProps {
  center: [number, number];
  zoom: number;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }, zoom: number) => void;
  heatmapPoints?: HeatmapPoint[];
  heatmapOpacity?: number;
  pois?: Record<string, POI[]>;
  showPOIs?: boolean;
  factors?: Factor[];
  popupTranslations?: PopupTranslations;
  factorTranslations?: FactorTranslations;
  /** Callback when map is ready with Leaflet instance */
  onMapReady?: (map: L.Map, L: typeof import('leaflet'), extensionLayer: L.LayerGroup) => void;
  /** Tile coordinates for canvas bounds (synchronous with heatmapPoints) */
  heatmapTileCoords?: { z: number; x: number; y: number }[];
  /** Flag indicating if heatmap data is ready for current tiles */
  isHeatmapDataReady?: boolean;
}

const MapView = forwardRef<MapViewRef, MapViewProps>(({
  center,
  zoom,
  onBoundsChange,
  heatmapPoints = [],
  heatmapOpacity = 0.6,
  pois = {},
  showPOIs = false,
  factors = [],
  popupTranslations = defaultPopupTranslations,
  factorTranslations = {},
  onMapReady,
  heatmapTileCoords = [],
  isHeatmapDataReady = true,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const extensionLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initializingRef = useRef(false);
  
  // Cleanup function for long press handlers
  const longPressCleanupRef = useRef<(() => void) | null>(null);
  
  // Read debug tile setters from store for reset on mount
  const setShowHeatmapTileBorders = useMapStore((s) => s.setShowHeatmapTileBorders);
  const setShowPropertyTileBorders = useMapStore((s) => s.setShowPropertyTileBorders);
  
  // Reset debug toggles on mount to avoid stale state from devtools
  useEffect(() => {
    setShowHeatmapTileBorders(false);
    setShowPropertyTileBorders(false);
    // Only run on mount - setters are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Use tile borders hook for debug visualization
  useTileBorders(mapReady, mapInstanceRef.current);
  
  // Use heatmap overlay hook
  useHeatmapOverlay({
    mapReady,
    mapInstance: mapInstanceRef.current,
    heatmapPoints,
    heatmapOpacity,
    heatmapTileCoords,
    isHeatmapDataReady,
  });
  
  // Use POI markers hook
  usePoiMarkers({
    mapReady,
    mapInstance: mapInstanceRef.current,
    pois,
    showPOIs,
    factors,
  });
  
  // Use useLatestRef for values accessed in callbacks
  const poisRef = useLatestRef(pois);
  const factorsRef = useLatestRef(factors);
  const popupTranslationsRef = useLatestRef(popupTranslations);
  const factorTranslationsRef = useLatestRef(factorTranslations);
  const onBoundsChangeRef = useLatestRef(onBoundsChange);
  const onMapReadyRef = useLatestRef(onMapReady);
  // Store initial center/zoom in refs to avoid re-initialization
  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(zoom);

  const handleMapClick = useCallback(async (e: L.LeafletMouseEvent) => {
    const L = (await import('leaflet')).default;
    const { lat, lng } = e.latlng;
    
    const { k, breakdown } = calculateFactorBreakdown(
      lat, lng, factorsRef.current, poisRef.current
    );
    
    const popupContent = generatePopupContent(
      k, breakdown,
      popupTranslationsRef.current,
      factorTranslationsRef.current
    );
    
    L.popup({ maxWidth: 300, className: 'location-rating-popup', autoPan: false })
      .setLatLng([lat, lng])
      .setContent(popupContent)
      .openOn(mapInstanceRef.current!);
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoomLevel?: number) => {
      mapInstanceRef.current?.flyTo([lat, lng], zoomLevel ?? 13, { duration: FLY_TO_DURATION });
    },
    fitBounds: (bounds: Bounds) => {
      mapInstanceRef.current?.flyToBounds(
        [[bounds.south, bounds.west], [bounds.north, bounds.east]],
        { padding: [FIT_BOUNDS_PADDING, FIT_BOUNDS_PADDING], duration: FIT_BOUNDS_DURATION, maxZoom: FIT_BOUNDS_MAX_ZOOM }
      );
    },
    invalidateSize: () => {
      mapInstanceRef.current?.invalidateSize();
    },
    getMap: () => mapInstanceRef.current,
    getExtensionLayerGroup: () => extensionLayerGroupRef.current,
    getLeaflet: () => leafletRef.current,
  }));

  // Initialize map
  useEffect(() => {
    if (initializingRef.current || mapInstanceRef.current) return;
    if (!containerRef.current) return;

    initializingRef.current = true;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        leafletRef.current = L;

        if (!containerRef.current) {
          initializingRef.current = false;
          return;
        }

        if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) {
          initializingRef.current = false;
          return;
        }

        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
        L.Icon.Default.mergeOptions(LEAFLET_ICON_URLS);

        const map = L.map(containerRef.current, {
          center: initialCenterRef.current,
          zoom: initialZoomRef.current,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
        }).addTo(map);

        extensionLayerGroupRef.current = L.layerGroup().addTo(map);
        
        map.createPane('heatmapPane');
        const heatmapPane = map.getPane('heatmapPane');
        if (heatmapPane) {
          heatmapPane.style.zIndex = String(Z_INDEX.MAP_HEATMAP_PANE);
        }

        mapInstanceRef.current = map;

        const handleBoundsChange = () => {
          if (!onBoundsChangeRef.current || !mapInstanceRef.current) return;
          try {
            const bounds = mapInstanceRef.current.getBounds();
            const currentZoom = mapInstanceRef.current.getZoom();
            onBoundsChangeRef.current({
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            }, currentZoom);
          } catch {
            // Ignore errors during cleanup
          }
        };

        map.on('moveend', handleBoundsChange);
        map.on('zoomend', handleBoundsChange);
        map.on('contextmenu', handleMapClick);

        const onLongPress = (latlng: L.LatLng) => {
          handleMapClick({ latlng } as L.LeafletMouseEvent);
        };

        // Store cleanup functions for long press handlers
        let cleanupTouchLongPress: (() => void) | undefined;
        let cleanupMouseLongPress: (() => void) | undefined;

        const mapContainer = containerRef.current;
        if (mapContainer) {
          cleanupTouchLongPress = setupTouchLongPress(mapContainer, map, onLongPress);
          cleanupMouseLongPress = setupMouseLongPress(mapContainer, map, onLongPress);
        }

        // Store cleanup functions in refs for use in cleanup
        longPressCleanupRef.current = () => {
          cleanupTouchLongPress?.();
          cleanupMouseLongPress?.();
        };

        setTimeout(() => {
          handleBoundsChange();
          setMapReady(true);
          
          // Notify parent that map is ready
          if (onMapReadyRef.current && extensionLayerGroupRef.current) {
            onMapReadyRef.current(map, L, extensionLayerGroupRef.current);
          }
        }, MAP_INIT_DELAY_MS);

      } catch (error) {
        console.error('Error initializing map:', error);
        initializingRef.current = false;
      }
    };

    initMap();

    return () => {
      // Clean up long press event listeners
      if (longPressCleanupRef.current) {
        longPressCleanupRef.current();
        longPressCleanupRef.current = null;
      }
      
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // Ignore cleanup errors
        }
        mapInstanceRef.current = null;
        leafletRef.current = null;
        extensionLayerGroupRef.current = null;
      }
      initializingRef.current = false;
      setMapReady(false);
    };
  }, [handleMapClick]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      style={{ minHeight: '100%', height: '100%' }}
    />
  );
});

MapView.displayName = 'MapView';

export default MapView;
