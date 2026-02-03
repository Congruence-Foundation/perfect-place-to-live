'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import { POI_COLORS, Z_INDEX, DEBUG_COLORS } from '@/constants';
import { calculateFactorBreakdown } from '@/lib/scoring';
import { renderHeatmapToCanvas } from '@/lib/rendering/canvasRenderer';
import { useMapStore } from '@/stores/mapStore';
import { tileToBounds, METERS_PER_DEGREE_LAT, metersPerDegreeLng } from '@/lib/geo';
import {
  generatePopupContent,
  defaultPopupTranslations,
  type PopupTranslations,
  type FactorTranslations,
} from './utils/popupContent';
import { setupTouchLongPress, setupMouseLongPress } from './hooks/useLongPress';
import {
  MAP_INIT_DELAY_MS,
  CANVAS_PIXELS_PER_CELL,
  CANVAS_MAX_DIMENSION,
  CANVAS_MIN_DIMENSION,
  POI_MARKER_RADIUS,
  POI_MARKER_BORDER_WIDTH,
  POI_MARKER_FILL_OPACITY,
  POI_TOOLTIP_OFFSET_Y,
  FLY_TO_DURATION,
  FIT_BOUNDS_DURATION,
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING,
  LEAFLET_ICON_URLS,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
  HEATMAP_CELL_SIZE_METERS,
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
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const extensionLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const canvasOverlayRef = useRef<L.ImageOverlay | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const tileBorderLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initializingRef = useRef(false);
  
  // Cleanup function for long press handlers
  const longPressCleanupRef = useRef<(() => void) | null>(null);
  
  // Read debug tile state from store
  const showHeatmapTileBorders = useMapStore((s) => s.showHeatmapTileBorders);
  const showPropertyTileBorders = useMapStore((s) => s.showPropertyTileBorders);
  const setShowHeatmapTileBorders = useMapStore((s) => s.setShowHeatmapTileBorders);
  const setShowPropertyTileBorders = useMapStore((s) => s.setShowPropertyTileBorders);
  const heatmapTiles = useMapStore((s) => s.heatmapDebugTiles);
  const propertyTiles = useMapStore((s) => s.extensionDebugTiles);
  
  // Reset debug toggles on mount to avoid stale state from devtools
  useEffect(() => {
    setShowHeatmapTileBorders(false);
    setShowPropertyTileBorders(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Track previous heatmap data to avoid unnecessary re-renders
  const prevHeatmapHashRef = useRef<string>('');
  
  const poisRef = useRef(pois);
  const factorsRef = useRef(factors);
  const popupTranslationsRef = useRef(popupTranslations);
  const factorTranslationsRef = useRef(factorTranslations);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onMapReadyRef = useRef(onMapReady);
  // Store initial center/zoom in refs to avoid re-initialization
  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(zoom);
  
  useEffect(() => { poisRef.current = pois; }, [pois]);
  useEffect(() => { factorsRef.current = factors; }, [factors]);
  useEffect(() => { popupTranslationsRef.current = popupTranslations; }, [popupTranslations]);
  useEffect(() => { factorTranslationsRef.current = factorTranslations; }, [factorTranslations]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);

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

        poiLayerGroupRef.current = L.layerGroup().addTo(map);
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
          // Remove overlay before destroying map
          if (canvasOverlayRef.current) {
            canvasOverlayRef.current.remove();
          }
          mapInstanceRef.current.remove();
        } catch {
          // Ignore cleanup errors
        }
        mapInstanceRef.current = null;
        leafletRef.current = null;
        poiLayerGroupRef.current = null;
        extensionLayerGroupRef.current = null;
        canvasOverlayRef.current = null;
        offscreenCanvasRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      initializingRef.current = false;
      setMapReady(false);
    };
  }, [handleMapClick]);

  // Update heatmap overlay
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    
    // Skip rendering if data is not ready for current tiles
    // This prevents the "rough edges" flash when tiles change but data hasn't arrived
    if (!isHeatmapDataReady) {
      return;
    }

    // Create a hash of the heatmap data to detect actual changes
    // Using length + sample of points + tiles for efficiency
    const createHash = () => {
      if (heatmapPoints.length === 0) return 'empty';
      const sample = heatmapPoints.slice(0, 10).map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.value.toFixed(3)}`).join('|');
      const tilesHash = heatmapTileCoords.map(t => `${t.z}:${t.x}:${t.y}`).sort().join(',');
      return `${heatmapPoints.length}:${heatmapOpacity}:${tilesHash}:${sample}`;
    };
    
    const currentHash = createHash();
    const hashChanged = currentHash !== prevHeatmapHashRef.current;
    
    if (!hashChanged) {
      return; // Data hasn't changed, skip re-render
    }
    prevHeatmapHashRef.current = currentHash;

    const updateGrid = async () => {
      try {
        const L = (await import('leaflet')).default;
        if (!mapInstanceRef.current) return;

        // If no points, remove existing overlay and return
        if (heatmapPoints.length === 0) {
          if (canvasOverlayRef.current) {
            canvasOverlayRef.current.remove();
            canvasOverlayRef.current = null;
          }
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          return;
        }

        // Calculate bounds from tiles (stable) instead of points (changes with pruning)
        // This prevents re-rendering when panning within the same tile set
        // Use heatmapTileCoords prop (synchronous with points) instead of store (async)
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        
        if (heatmapTileCoords.length > 0) {
          // Use tile bounds for stable canvas sizing
          for (const tile of heatmapTileCoords) {
            const tileBounds = tileToBounds(tile.z, tile.x, tile.y);
            
            if (tileBounds.south < minLat) minLat = tileBounds.south;
            if (tileBounds.north > maxLat) maxLat = tileBounds.north;
            if (tileBounds.west < minLng) minLng = tileBounds.west;
            if (tileBounds.east > maxLng) maxLng = tileBounds.east;
          }
        } else {
          // Fallback to point bounds if no tiles available
          for (const point of heatmapPoints) {
            if (point.lat < minLat) minLat = point.lat;
            if (point.lat > maxLat) maxLat = point.lat;
            if (point.lng < minLng) minLng = point.lng;
            if (point.lng > maxLng) maxLng = point.lng;
          }
        }
        
        const latRange = maxLat - minLat;
        const lngRange = maxLng - minLng;
        
        // Use tile bounds directly (no padding needed since tiles already cover the area)
        const bounds: Bounds = {
          north: maxLat,
          south: minLat,
          east: maxLng,
          west: minLng,
        };

        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }

        // Calculate canvas dimensions based on geographic area and fixed cell size
        // Use 100m cells, convert to degrees at center latitude
        const centerLat = (maxLat + minLat) / 2;
        
        // Calculate how many cells fit in the bounds
        const cellsLng = Math.ceil((lngRange * metersPerDegreeLng(centerLat)) / HEATMAP_CELL_SIZE_METERS);
        const cellsLat = Math.ceil((latRange * METERS_PER_DEGREE_LAT) / HEATMAP_CELL_SIZE_METERS);
        
        // Use fixed pixels per cell for consistent rendering
        const pixelsPerCell = CANVAS_PIXELS_PER_CELL;
        const canvasWidth = Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cellsLng * pixelsPerCell));
        const canvasHeight = Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cellsLat * pixelsPerCell));
        
        const canvas = offscreenCanvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        renderHeatmapToCanvas(ctx, heatmapPoints, bounds, canvas.width, canvas.height, {
          opacity: heatmapOpacity,
          cellSizeMeters: HEATMAP_CELL_SIZE_METERS,
        });

        const overlayBounds: L.LatLngBoundsExpression = [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ];

        canvas.toBlob((blob) => {
          if (!blob || !mapInstanceRef.current) return;
          
          const url = URL.createObjectURL(blob);
          const oldUrl = blobUrlRef.current;
          const oldOverlay = canvasOverlayRef.current;
          blobUrlRef.current = url;

          // Create pane if needed
          let pane = mapInstanceRef.current!.getPane('heatmapPane');
          if (!pane) {
            mapInstanceRef.current!.createPane('heatmapPane');
            pane = mapInstanceRef.current!.getPane('heatmapPane');
            if (pane) pane.style.zIndex = String(Z_INDEX.MAP_HEATMAP_PANE);
          }
          
          // Pre-load the new image first
          const tempImg = new Image();
          tempImg.onload = () => {
            if (!mapInstanceRef.current) return;
            
            // Image is now cached - create new overlay (will load instantly)
            const newOverlay = L.imageOverlay(url, overlayBounds, {
              opacity: 1,
              interactive: false,
              pane: 'heatmapPane',
            });
            
            // Add new overlay to map first (old one stays visible underneath)
            newOverlay.addTo(mapInstanceRef.current!);
            
            // Update ref BEFORE scheduling removal
            // This ensures rapid updates don't remove the wrong overlay
            canvasOverlayRef.current = newOverlay;
            
            // Remove old overlay after new one is painted
            // Double rAF ensures browser has composited the new overlay
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // Only remove if oldOverlay is not the current one
                // (protects against race conditions with rapid updates)
                if (oldOverlay && oldOverlay !== canvasOverlayRef.current) {
                  oldOverlay.remove();
                }
                if (oldUrl) {
                  URL.revokeObjectURL(oldUrl);
                }
              });
            });
          };
          tempImg.src = url;
        }, 'image/png');

      } catch (error) {
        console.error('Error updating grid:', error);
      }
    };

    updateGrid();
  }, [mapReady, heatmapPoints, heatmapOpacity, heatmapTileCoords, isHeatmapDataReady]);

  // Update POI markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !poiLayerGroupRef.current) return;

    const updatePOIs = async () => {
      try {
        const L = (await import('leaflet')).default;
        if (!poiLayerGroupRef.current) return;

        poiLayerGroupRef.current.clearLayers();
        if (!showPOIs) return;

        const factorNames: Record<string, string> = {};
        factors.forEach((f) => { factorNames[f.id] = f.name; });

        Object.entries(pois).forEach(([factorId, poiList]) => {
          const color = POI_COLORS[factorId] || '#6b7280';
          const factorName = factorNames[factorId] || factorId;

          poiList.forEach((poi) => {
            const marker = L.circleMarker([poi.lat, poi.lng], {
              radius: POI_MARKER_RADIUS,
              fillColor: color,
              color: '#ffffff',
              weight: POI_MARKER_BORDER_WIDTH,
              opacity: 1,
              fillOpacity: POI_MARKER_FILL_OPACITY,
            });

            const tooltipContent = poi.name 
              ? `<strong>${poi.name}</strong><br/><span style="color: ${color}">${factorName}</span>`
              : `<span style="color: ${color}">${factorName}</span>`;
            
            marker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, POI_TOOLTIP_OFFSET_Y] });
            marker.addTo(poiLayerGroupRef.current!);
          });
        });
      } catch (error) {
        console.error('Error updating POI markers:', error);
      }
    };

    updatePOIs();
  }, [mapReady, pois, showPOIs, factors]);

  // Render tile borders for debugging
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    
    // If neither border type is enabled, clear and return
    if (!showHeatmapTileBorders && !showPropertyTileBorders) {
      if (tileBorderLayerRef.current) {
        tileBorderLayerRef.current.clearLayers();
      }
      return;
    }

    const renderTileBorders = async () => {
      try {
        const L = (await import('leaflet')).default;
        const map = mapInstanceRef.current;
        if (!map) return;

        // Create or clear tile border layer
        if (!tileBorderLayerRef.current) {
          // Create a pane for tile borders above the heatmap
          let tileBorderPane = map.getPane('tileBorderPane');
          if (!tileBorderPane) {
            map.createPane('tileBorderPane');
            tileBorderPane = map.getPane('tileBorderPane');
            if (tileBorderPane) {
              tileBorderPane.style.zIndex = String(Z_INDEX.MAP_TILE_BORDER_PANE);
              tileBorderPane.style.pointerEvents = 'none';
            }
          }
          tileBorderLayerRef.current = L.layerGroup([], { pane: 'tileBorderPane' }).addTo(map);
        }
        tileBorderLayerRef.current.clearLayers();

        // Render heatmap tile borders (blue)
        if (showHeatmapTileBorders) {
          if (heatmapTiles.length > 0) {
            for (const tile of heatmapTiles) {
              const bounds = tileToBounds(tile.z, tile.x, tile.y);
              const rect = L.rectangle(
                [[bounds.south, bounds.west], [bounds.north, bounds.east]],
                {
                  color: DEBUG_COLORS.HEATMAP_TILE_BORDER,
                  weight: 2,
                  fill: false,
                  dashArray: '5, 5',
                  interactive: false,
                  pane: 'tileBorderPane',
                }
              );
              rect.addTo(tileBorderLayerRef.current!);
              
              // Add tile label at center
              const center = [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2] as [number, number];
              const label = L.marker(center, {
                icon: L.divIcon({
                  className: '',
                  html: `<div style="background: rgb(59, 130, 246); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-family: monospace; white-space: nowrap; transform: translate(-50%, -100%);">H ${tile.z}/${tile.x}/${tile.y}</div>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                }),
                interactive: false,
                pane: 'tileBorderPane',
              });
              label.addTo(tileBorderLayerRef.current!);
            }
          }
        }

        // Render property tile borders (orange)
        if (showPropertyTileBorders) {
          if (propertyTiles.length > 0) {
            for (const tile of propertyTiles) {
              const bounds = tileToBounds(tile.z, tile.x, tile.y);
              const rect = L.rectangle(
                [[bounds.south, bounds.west], [bounds.north, bounds.east]],
                {
                  color: DEBUG_COLORS.PROPERTY_TILE_BORDER,
                  weight: 2,
                  fill: false,
                  dashArray: '3, 3',
                  interactive: false,
                  pane: 'tileBorderPane',
                }
              );
              rect.addTo(tileBorderLayerRef.current!);
              
              // Add tile label (offset below heatmap label)
              const center = [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2] as [number, number];
              const label = L.marker(center, {
                icon: L.divIcon({
                  className: '',
                  html: `<div style="background: rgb(249, 115, 22); color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-family: monospace; white-space: nowrap; transform: translate(-50%, 5px);">P ${tile.z}/${tile.x}/${tile.y}</div>`,
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                }),
                interactive: false,
                pane: 'tileBorderPane',
              });
              label.addTo(tileBorderLayerRef.current!);
            }
          }
        }
      } catch (error) {
        console.error('Error rendering tile borders:', error);
      }
    };

    renderTileBorders();
  }, [mapReady, showHeatmapTileBorders, showPropertyTileBorders, heatmapTiles, propertyTiles]);

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
