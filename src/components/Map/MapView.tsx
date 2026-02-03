'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import { POI_COLORS, getColorForK, Z_INDEX, DEBUG_COLORS } from '@/constants';
import { formatDistance } from '@/lib/utils';
import { calculateFactorBreakdown, FactorBreakdown } from '@/lib/scoring';
import { renderHeatmapToCanvas } from '@/lib/rendering/canvasRenderer';
import { useMapStore } from '@/stores/mapStore';

// Popup translations interface
export interface PopupTranslations {
  excellent: string;
  good: string;
  average: string;
  belowAverage: string;
  poor: string;
  footer: string;
  goodLabel: string;
  improveLabel: string;
  noData: string;
}

// Factor name translations type
export type FactorTranslations = Record<string, string>;

// Get rating label for K value
function getRatingLabel(k: number, translations: PopupTranslations): { label: string; emoji: string } {
  if (k < 0.2) return { label: translations.excellent, emoji: '🌟' };
  if (k < 0.4) return { label: translations.good, emoji: '👍' };
  if (k < 0.6) return { label: translations.average, emoji: '😐' };
  if (k < 0.8) return { label: translations.belowAverage, emoji: '👎' };
  return { label: translations.poor, emoji: '⚠️' };
}

// Generate popup HTML content - compact version
function generatePopupContent(
  k: number,
  breakdown: FactorBreakdown[],
  translations: PopupTranslations,
  factorTranslations: FactorTranslations
): string {
  const allNoPOIs = breakdown.length > 0 && breakdown.every(item => item.noPOIs);
  
  if (allNoPOIs) {
    return `
      <div style="min-width: 180px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; text-align: center; padding: 8px;">
        <div style="font-size: 24px; margin-bottom: 8px;">📍</div>
        <div style="color: #6b7280;">${translations.noData}</div>
      </div>
    `;
  }
  
  const rating = getRatingLabel(k, translations);
  const kColor = getColorForK(k);
  const scorePercent = Math.round((1 - k) * 100);

  const breakdownRows = breakdown.map(item => {
    const color = POI_COLORS[item.factorId] || '#6b7280';
    const distanceText = item.noPOIs ? '—' : formatDistance(item.distance);
    const barColor = item.score < 0.3 ? '#22c55e' : item.score < 0.6 ? '#eab308' : '#ef4444';
    const scoreBarWidth = Math.round(item.score * 100);
    const icon = item.isNegative 
      ? (item.score > 0.5 ? '⚠' : '✓') 
      : (item.score < 0.5 ? '✓' : '⚠');
    const iconColor = icon === '✓' ? '#22c55e' : '#ef4444';
    const weightDisplay = item.weight > 0 ? `+${item.weight}` : `${item.weight}`;
    const weightColor = item.weight > 0 ? '#22c55e' : item.weight < 0 ? '#ef4444' : '#6b7280';
    const nearbyText = item.nearbyCount > 1 ? `(${item.nearbyCount})` : '';
    const factorName = factorTranslations[item.factorId] || item.factorName;

    return `
      <tr style="height: 22px;">
        <td style="width: 10px; padding: 2px 0;">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: ${color};"></div>
        </td>
        <td style="padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;" title="${factorName}${item.nearbyCount > 1 ? ` - ${item.nearbyCount} nearby` : ''}">
          ${factorName}
        </td>
        <td style="width: 30px; padding: 2px; text-align: right; font-size: 9px; color: ${weightColor};">${weightDisplay}</td>
        <td style="width: 40px; padding: 2px;">
          <div style="height: 3px; background: #e5e7eb; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: ${scoreBarWidth}%; background: ${barColor};"></div>
          </div>
        </td>
        <td style="width: 50px; padding: 2px 4px; text-align: right; color: #6b7280;">${distanceText} <span style="color: #9ca3af; font-size: 8px;">${nearbyText}</span></td>
        <td style="width: 14px; text-align: center; color: ${iconColor}; font-weight: bold;">${icon}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="min-width: 200px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 11px;">
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb;">
        <span style="font-size: 18px;">${rating.emoji}</span>
        <div style="flex: 1;">
          <span style="font-weight: 600; font-size: 13px; color: ${kColor};">${rating.label}</span>
          <span style="color: #6b7280; margin-left: 4px;">${scorePercent}%</span>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          ${breakdownRows}
        </tbody>
      </table>
      <div style="font-size: 9px; color: #9ca3af; margin-top: 4px; padding-top: 4px; border-top: 1px solid #e5e7eb;">
        ${translations.footer} • ✓ ${translations.goodLabel} • ⚠ ${translations.improveLabel}
      </div>
    </div>
  `;
}

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

// Default translations (English)
const defaultPopupTranslations: PopupTranslations = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  belowAverage: 'Below Average',
  poor: 'Poor',
  footer: 'Right-click for details',
  goodLabel: 'good',
  improveLabel: 'improve',
  noData: 'No data available for this area. Zoom in or pan to load POIs.',
};

// Long press configuration
const LONG_PRESS_DURATION_MS = 500;
const TOUCH_MOVE_THRESHOLD_PX = 10;
const MOUSE_MOVE_THRESHOLD_PX = 5;

// Map initialization
const MAP_INIT_DELAY_MS = 100;

// Canvas rendering configuration
const CANVAS_PIXELS_PER_CELL = 4;
const CANVAS_MAX_DIMENSION = 4096;
const CANVAS_MIN_DIMENSION = 256;

// POI marker styling
const POI_MARKER_RADIUS = 6;
const POI_MARKER_BORDER_WIDTH = 2;
const POI_MARKER_FILL_OPACITY = 0.8;
const POI_TOOLTIP_OFFSET_Y = -8;

interface LongPressState {
  timer: ReturnType<typeof setTimeout> | null;
  startPos: { x: number; y: number } | null;
  latLng: L.LatLng | null;
}

function setupTouchLongPress(
  container: HTMLElement,
  mapInstance: L.Map,
  onLongPress: (latlng: L.LatLng) => void
): () => void {
  const state: LongPressState = { timer: null, startPos: null, latLng: null };

  const clearState = () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.startPos = null;
    state.latLng = null;
  };

  const handleTouchStart = (e: TouchEvent) => {
    clearState();
    const touch = e.touches[0];
    state.startPos = { x: touch.clientX, y: touch.clientY };
    try {
      const containerPoint = mapInstance.mouseEventToContainerPoint({
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as MouseEvent);
      state.latLng = mapInstance.containerPointToLatLng(containerPoint);
    } catch {
      return;
    }
    state.timer = setTimeout(() => {
      if (state.latLng) {
        e.preventDefault();
        onLongPress(state.latLng);
      }
      clearState();
    }, LONG_PRESS_DURATION_MS);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!state.timer || !state.startPos) return;
    const touch = e.touches[0];
    const dx = touch.clientX - state.startPos.x;
    const dy = touch.clientY - state.startPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > TOUCH_MOVE_THRESHOLD_PX) {
      clearState();
    }
  };

  const handleTouchEnd = () => clearState();

  container.addEventListener('touchstart', handleTouchStart, { passive: false });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
  container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  return () => {
    clearState();
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);
    container.removeEventListener('touchcancel', handleTouchEnd);
  };
}

function setupMouseLongPress(
  container: HTMLElement,
  mapInstance: L.Map,
  onLongPress: (latlng: L.LatLng) => void
): () => void {
  const state: LongPressState = { timer: null, startPos: null, latLng: null };

  const clearState = () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.startPos = null;
    state.latLng = null;
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    clearState();
    state.startPos = { x: e.clientX, y: e.clientY };
    try {
      const containerPoint = mapInstance.mouseEventToContainerPoint(e);
      state.latLng = mapInstance.containerPointToLatLng(containerPoint);
    } catch {
      return;
    }
    state.timer = setTimeout(() => {
      if (state.latLng) {
        onLongPress(state.latLng);
      }
      clearState();
    }, LONG_PRESS_DURATION_MS);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!state.timer || !state.startPos) return;
    const dx = e.clientX - state.startPos.x;
    const dy = e.clientY - state.startPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOUSE_MOVE_THRESHOLD_PX) {
      clearState();
    }
  };

  const handleMouseUp = () => clearState();

  container.addEventListener('mousedown', handleMouseDown);
  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseup', handleMouseUp);
  container.addEventListener('mouseleave', handleMouseUp);

  return () => {
    clearState();
    container.removeEventListener('mousedown', handleMouseDown);
    container.removeEventListener('mousemove', handleMouseMove);
    container.removeEventListener('mouseup', handleMouseUp);
    container.removeEventListener('mouseleave', handleMouseUp);
  };
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
      mapInstanceRef.current?.flyTo([lat, lng], zoomLevel ?? 13, { duration: 1.5 });
    },
    fitBounds: (bounds: Bounds) => {
      mapInstanceRef.current?.flyToBounds(
        [[bounds.south, bounds.west], [bounds.north, bounds.east]],
        { padding: [50, 50], duration: 1.5, maxZoom: 14 }
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
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        const map = L.map(containerRef.current, {
          center: initialCenterRef.current,
          zoom: initialZoomRef.current,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
            const n = Math.pow(2, tile.z);
            const tileSouth = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.y + 1) / n))) * 180 / Math.PI;
            const tileNorth = Math.atan(Math.sinh(Math.PI * (1 - 2 * tile.y / n))) * 180 / Math.PI;
            const tileWest = tile.x / n * 360 - 180;
            const tileEast = (tile.x + 1) / n * 360 - 180;
            
            if (tileSouth < minLat) minLat = tileSouth;
            if (tileNorth > maxLat) maxLat = tileNorth;
            if (tileWest < minLng) minLng = tileWest;
            if (tileEast > maxLng) maxLng = tileEast;
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
        const CELL_SIZE_METERS = 100;
        const METERS_PER_DEGREE_LAT = 111320;
        const centerLat = (maxLat + minLat) / 2;
        const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(centerLat * Math.PI / 180);
        
        // Calculate how many cells fit in the bounds
        const cellsLng = Math.ceil((lngRange * metersPerDegreeLng) / CELL_SIZE_METERS);
        const cellsLat = Math.ceil((latRange * METERS_PER_DEGREE_LAT) / CELL_SIZE_METERS);
        
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
          cellSizeMeters: 100, // Fixed cell size for consistent rendering across tiles
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
          tileBorderLayerRef.current = L.layerGroup({ pane: 'tileBorderPane' }).addTo(map);
        }
        tileBorderLayerRef.current.clearLayers();

        // Helper to convert tile coords to bounds
        const tileToBounds = (z: number, x: number, y: number) => {
          const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
          const north = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
          const south = (180 / Math.PI) * Math.atan(
            0.5 * (Math.exp(n - (2 * Math.PI) / Math.pow(2, z)) - Math.exp(-(n - (2 * Math.PI) / Math.pow(2, z))))
          );
          const west = (x / Math.pow(2, z)) * 360 - 180;
          const east = ((x + 1) / Math.pow(2, z)) * 360 - 180;
          return { north, south, east, west };
        };

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
