'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import { POI_COLORS, getColorForK, Z_INDEX } from '@/constants';
import { formatDistance } from '@/lib/utils';
import { calculateFactorBreakdown, FactorBreakdown } from '@/lib/scoring';
import { renderHeatmapToCanvas } from '@/hooks/useCanvasRenderer';

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
  lat: number,
  lng: number,
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

  let html = `
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
  `;

  for (const item of breakdown) {
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

    html += `
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
  }

  html += `
        </tbody>
      </table>
      <div style="font-size: 9px; color: #9ca3af; margin-top: 4px; padding-top: 4px; border-top: 1px solid #e5e7eb;">
        ${translations.footer} • ✓ ${translations.goodLabel} • ⚠ ${translations.improveLabel}
      </div>
    </div>
  `;

  return html;
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
const DEFAULT_GRID_SPACING = 0.002;

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
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const extensionLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const canvasOverlayRef = useRef<L.ImageOverlay | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initializingRef = useRef(false);
  
  // Track previous heatmap data to avoid unnecessary re-renders
  const prevHeatmapHashRef = useRef<string>('');
  
  const currentBoundsRef = useRef<Bounds | null>(null);
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
      lat, lng, k, breakdown,
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

        gridLayerRef.current = L.layerGroup().addTo(map);
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

        const mapContainer = containerRef.current;
        if (mapContainer) {
          setupTouchLongPress(mapContainer, map, onLongPress);
          setupMouseLongPress(mapContainer, map, onLongPress);
        }

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
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // Ignore cleanup errors
        }
        mapInstanceRef.current = null;
        leafletRef.current = null;
        gridLayerRef.current = null;
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

    // Create a hash of the heatmap data to detect actual changes
    // Using length + sample of points for efficiency
    const createHash = () => {
      if (heatmapPoints.length === 0) return 'empty';
      const sample = heatmapPoints.slice(0, 10).map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.value.toFixed(3)}`).join('|');
      return `${heatmapPoints.length}:${heatmapOpacity}:${sample}`;
    };
    
    const currentHash = createHash();
    if (currentHash === prevHeatmapHashRef.current) {
      return; // Data hasn't changed, skip re-render
    }
    prevHeatmapHashRef.current = currentHash;

    const updateGrid = async () => {
      try {
        const L = (await import('leaflet')).default;
        if (!mapInstanceRef.current) return;

        if (gridLayerRef.current) {
          gridLayerRef.current.clearLayers();
        }

        if (heatmapPoints.length === 0) return;

        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        
        for (const point of heatmapPoints) {
          if (point.lat < minLat) minLat = point.lat;
          if (point.lat > maxLat) maxLat = point.lat;
          if (point.lng < minLng) minLng = point.lng;
          if (point.lng > maxLng) maxLng = point.lng;
        }
        
        const uniqueLats = new Set(heatmapPoints.map(p => p.lat)).size;
        const uniqueLngs = new Set(heatmapPoints.map(p => p.lng)).size;
        
        const latSpacing = uniqueLats > 1 ? (maxLat - minLat) / (uniqueLats - 1) : DEFAULT_GRID_SPACING;
        const lngSpacing = uniqueLngs > 1 ? (maxLng - minLng) / (uniqueLngs - 1) : DEFAULT_GRID_SPACING;
        
        const bounds: Bounds = {
          north: maxLat + latSpacing / 2,
          south: minLat - latSpacing / 2,
          east: maxLng + lngSpacing / 2,
          west: minLng - lngSpacing / 2,
        };
        currentBoundsRef.current = bounds;

        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }

        const pixelsPerCell = CANVAS_PIXELS_PER_CELL;
        const canvasWidth = Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, uniqueLngs * pixelsPerCell));
        const canvasHeight = Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, uniqueLats * pixelsPerCell));
        
        const canvas = offscreenCanvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        renderHeatmapToCanvas(ctx, heatmapPoints, bounds, canvas.width, canvas.height, {
          opacity: heatmapOpacity,
        });

        const overlayBounds: L.LatLngBoundsExpression = [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ];

        canvas.toBlob((blob) => {
          if (!blob || !mapInstanceRef.current) return;
          
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;

          if (canvasOverlayRef.current) {
            canvasOverlayRef.current.setUrl(url);
            canvasOverlayRef.current.setBounds(L.latLngBounds(overlayBounds));
          } else {
            let pane = mapInstanceRef.current!.getPane('heatmapPane');
            if (!pane) {
              mapInstanceRef.current!.createPane('heatmapPane');
              pane = mapInstanceRef.current!.getPane('heatmapPane');
              if (pane) pane.style.zIndex = String(Z_INDEX.MAP_HEATMAP_PANE);
            }
            
            canvasOverlayRef.current = L.imageOverlay(url, overlayBounds, {
              opacity: 1,
              interactive: false,
              pane: 'heatmapPane',
            }).addTo(mapInstanceRef.current!);
          }
        }, 'image/png');

      } catch (error) {
        console.error('Error updating grid:', error);
      }
    };

    updateGrid();
  }, [mapReady, heatmapPoints, heatmapOpacity]);

  // Sync canvas overlay with map view
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    
    const handleViewChange = () => {
      if (canvasOverlayRef.current && map) {
        try {
          const currentBounds = canvasOverlayRef.current.getBounds();
          if (currentBounds) {
            canvasOverlayRef.current.setBounds(currentBounds);
          }
        } catch {
          // Ignore errors
        }
      }
    };
    
    map.on('zoomend', handleViewChange);
    map.on('moveend', handleViewChange);
    
    return () => {
      map.off('zoomend', handleViewChange);
      map.off('moveend', handleViewChange);
    };
  }, [mapReady]);

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
