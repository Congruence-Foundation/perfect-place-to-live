'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import { OtodomProperty, PropertyCluster, PropertyFilters, ClusterPropertiesResponse, EstateType } from '@/types/property';
import { POI_COLORS, getColorForK } from '@/constants';
import { formatDistance } from '@/lib/utils';
import { formatPrice, roomCountToNumber } from '@/lib/format';
import { generatePropertyMarkerHtml, getPropertyMarkerClassName } from '@/lib/property-markers';
import { calculateFactorBreakdown, FactorBreakdown } from '@/lib/calculator';
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
  // Check if all factors have no POI data
  const allNoPOIs = breakdown.length > 0 && breakdown.every(item => item.noPOIs);
  
  if (allNoPOIs) {
    // Show "no data" message when no POIs are loaded
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
    
    // Show weight with sign
    const weightDisplay = item.weight > 0 ? `+${item.weight}` : `${item.weight}`;
    const weightColor = item.weight > 0 ? '#22c55e' : item.weight < 0 ? '#ef4444' : '#6b7280';
    
    // Show nearby count if more than 1
    const nearbyText = item.nearbyCount > 1 ? `(${item.nearbyCount})` : '';
    
    // Get translated factor name
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
}

interface MapViewProps {
  center: [number, number];
  zoom: number;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  heatmapPoints?: HeatmapPoint[];
  heatmapOpacity?: number;
  pois?: Record<string, POI[]>;
  showPOIs?: boolean;
  factors?: Factor[];
  popupTranslations?: PopupTranslations;
  factorTranslations?: FactorTranslations;
  properties?: OtodomProperty[];
  propertyClusters?: PropertyCluster[];
  showProperties?: boolean;
  propertyFilters?: PropertyFilters;
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

/**
 * Long press state for tracking touch/mouse interactions
 */
interface LongPressState {
  timer: ReturnType<typeof setTimeout> | null;
  startPos: { x: number; y: number } | null;
  latLng: L.LatLng | null;
}

/**
 * Setup touch-based long press handler for mobile devices
 * Returns cleanup function to remove event listeners
 */
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
    
    // Safety check: ensure map container is ready
    try {
      const containerPoint = mapInstance.mouseEventToContainerPoint({
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as MouseEvent);
      state.latLng = mapInstance.containerPointToLatLng(containerPoint);
    } catch {
      // Map not ready yet, ignore
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
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > TOUCH_MOVE_THRESHOLD_PX) {
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

/**
 * Setup mouse-based long press handler for desktop
 * Returns cleanup function to remove event listeners
 */
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
    if (e.button !== 0) return; // Only left click
    
    clearState();
    state.startPos = { x: e.clientX, y: e.clientY };
    
    // Safety check: ensure map container is ready
    try {
      const containerPoint = mapInstance.mouseEventToContainerPoint(e);
      state.latLng = mapInstance.containerPointToLatLng(containerPoint);
    } catch {
      // Map not ready yet, ignore
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
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > MOUSE_MOVE_THRESHOLD_PX) {
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
  properties = [],
  propertyClusters = [],
  showProperties = false,
  propertyFilters,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const propertyLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const propertyMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const clusterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const canvasOverlayRef = useRef<L.ImageOverlay | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobUrlRef = useRef<string | null>(null); // Track blob URL for cleanup
  const [mapReady, setMapReady] = useState(false);
  const initializingRef = useRef(false);
  
  // Store current bounds for canvas rendering
  const currentBoundsRef = useRef<Bounds | null>(null);
  
  // Store current pois and factors in refs for click handler
  const poisRef = useRef(pois);
  const factorsRef = useRef(factors);
  const popupTranslationsRef = useRef(popupTranslations);
  const factorTranslationsRef = useRef(factorTranslations);
  
  // Update refs when props change
  useEffect(() => {
    poisRef.current = pois;
  }, [pois]);
  
  useEffect(() => {
    factorsRef.current = factors;
  }, [factors]);

  useEffect(() => {
    popupTranslationsRef.current = popupTranslations;
  }, [popupTranslations]);

  useEffect(() => {
    factorTranslationsRef.current = factorTranslations;
  }, [factorTranslations]);

  // Handle map click to show location details
  const handleMapClick = useCallback(async (e: L.LeafletMouseEvent) => {
    const L = (await import('leaflet')).default;
    const { lat, lng } = e.latlng;
    
    // Calculate factor breakdown for clicked location
    const { k, breakdown } = calculateFactorBreakdown(
      lat, 
      lng, 
      factorsRef.current, 
      poisRef.current
    );
    
    // Generate and show popup with translations
    const popupContent = generatePopupContent(
      lat, 
      lng, 
      k, 
      breakdown,
      popupTranslationsRef.current,
      factorTranslationsRef.current
    );
    
    const popupOptions: L.PopupOptions = {
      maxWidth: 300,
      className: 'location-rating-popup',
      autoPan: false, // Disable auto-pan to prevent map movement
    };
    
    L.popup(popupOptions)
      .setLatLng([lat, lng])
      .setContent(popupContent)
      .openOn(mapInstanceRef.current!);
  }, []);

  // Expose flyTo, fitBounds, and invalidateSize methods via ref
  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoomLevel?: number) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([lat, lng], zoomLevel ?? 13, {
          duration: 1.5,
        });
      }
    },
    fitBounds: (bounds: Bounds) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyToBounds(
          [[bounds.south, bounds.west], [bounds.north, bounds.east]],
          {
            padding: [50, 50],
            duration: 1.5,
            maxZoom: 14,
          }
        );
      }
    },
    invalidateSize: () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    },
  }));

  // Initialize map
  useEffect(() => {
    // Prevent double initialization
    if (initializingRef.current || mapInstanceRef.current) return;
    if (!containerRef.current) return;

    initializingRef.current = true;

    const initMap = async () => {
      try {
        // Dynamic imports
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        // Check if container still exists and is empty
        if (!containerRef.current) {
          initializingRef.current = false;
          return;
        }

        // Check if map already exists on this container
        if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) {
          initializingRef.current = false;
          return;
        }

        // Fix default marker icons
        delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        // Create map
        const map = L.map(containerRef.current, {
          center: center,
          zoom: zoom,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        // Create layer groups
        gridLayerRef.current = L.layerGroup().addTo(map);
        poiLayerGroupRef.current = L.layerGroup().addTo(map);
        propertyLayerGroupRef.current = L.layerGroup().addTo(map);
        
        // Create a custom pane for the heatmap overlay (between tiles and markers)
        map.createPane('heatmapPane');
        const heatmapPane = map.getPane('heatmapPane');
        if (heatmapPane) {
          heatmapPane.style.zIndex = '450'; // Above tiles (200), below overlays (400) and markers (600)
        }

        // Store map reference
        mapInstanceRef.current = map;

        // Handle bounds change
        const handleBoundsChange = () => {
          if (!onBoundsChange || !mapInstanceRef.current) return;
          try {
            const bounds = mapInstanceRef.current.getBounds();
            onBoundsChange({
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest(),
            });
          } catch {
            // Ignore errors during cleanup
          }
        };

        map.on('moveend', handleBoundsChange);
        map.on('zoomend', handleBoundsChange);
        
        // Add right-click (context menu) handler for location details popup (works on desktop)
        map.on('contextmenu', handleMapClick);

        // Long press callback for showing popup
        const onLongPress = (latlng: L.LatLng) => {
          handleMapClick({ latlng } as L.LeafletMouseEvent);
        };

        // Setup long-press handlers for touch and mouse
        const mapContainer = containerRef.current;
        if (mapContainer) {
          setupTouchLongPress(mapContainer, map, onLongPress);
          setupMouseLongPress(mapContainer, map, onLongPress);
        }

        // Trigger initial bounds after a short delay to ensure map is ready
        setTimeout(() => {
          handleBoundsChange();
          setMapReady(true);
        }, 100);

      } catch (error) {
        console.error('Error initializing map:', error);
        initializingRef.current = false;
      }
    };

    initMap();

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // Ignore cleanup errors
        }
        mapInstanceRef.current = null;
        gridLayerRef.current = null;
        poiLayerGroupRef.current = null;
        propertyLayerGroupRef.current = null;
        propertyMarkersRef.current.clear();
        clusterMarkersRef.current.clear();
        canvasOverlayRef.current = null;
        offscreenCanvasRef.current = null;
      }
      // Revoke blob URL to prevent memory leak
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      initializingRef.current = false;
      setMapReady(false);
    };
  }, [handleMapClick]); // Include handleMapClick in deps

  // Update grid overlay when points change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    const updateGrid = async () => {
      try {
        const L = (await import('leaflet')).default;

        if (!mapInstanceRef.current) return;

        // Clear rectangle-based grid layer (legacy, kept for cleanup)
        if (gridLayerRef.current) {
          gridLayerRef.current.clearLayers();
        }

        if (heatmapPoints.length === 0) {
          // Don't remove the overlay - just leave it as is
          // This prevents flickering during data loading
          return;
        }

        // Canvas-based rendering
        const startTime = performance.now();

        // Calculate bounds from the heatmap points themselves (not viewport)
        // This ensures the overlay covers all the data
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        
        for (const point of heatmapPoints) {
          if (point.lat < minLat) minLat = point.lat;
          if (point.lat > maxLat) maxLat = point.lat;
          if (point.lng < minLng) minLng = point.lng;
          if (point.lng > maxLng) maxLng = point.lng;
        }
        
        // Get unique lat/lng counts to determine grid dimensions
        const uniqueLats = new Set(heatmapPoints.map(p => p.lat)).size;
        const uniqueLngs = new Set(heatmapPoints.map(p => p.lng)).size;
        
        // Add a small buffer for cell size
        const latSpacing = uniqueLats > 1 ? (maxLat - minLat) / (uniqueLats - 1) : 0.002;
        const lngSpacing = uniqueLngs > 1 ? (maxLng - minLng) / (uniqueLngs - 1) : 0.002;
        
        const bounds: Bounds = {
          north: maxLat + latSpacing / 2,
          south: minLat - latSpacing / 2,
          east: maxLng + lngSpacing / 2,
          west: minLng - lngSpacing / 2,
        };
        currentBoundsRef.current = bounds;

        // Create offscreen canvas if needed
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }

        // Size canvas based on grid dimensions - each cell gets ~4 pixels for quality
        const pixelsPerCell = 4;
        const canvasWidth = Math.min(4096, Math.max(256, uniqueLngs * pixelsPerCell));
        const canvasHeight = Math.min(4096, Math.max(256, uniqueLats * pixelsPerCell));
        
        const canvas = offscreenCanvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Render heatmap to canvas
        renderHeatmapToCanvas(ctx, heatmapPoints, bounds, canvas.width, canvas.height, {
          opacity: heatmapOpacity,
        });

        // Create or update image overlay using the DATA bounds (not viewport)
        const overlayBounds: L.LatLngBoundsExpression = [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ];

        // Use toBlob instead of toDataURL for better performance
        // toBlob is async and doesn't block the main thread
        canvas.toBlob((blob) => {
          if (!blob || !mapInstanceRef.current) return;
          
          // Revoke previous blob URL to prevent memory leak
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;

          if (canvasOverlayRef.current) {
            canvasOverlayRef.current.setUrl(url);
            canvasOverlayRef.current.setBounds(L.latLngBounds(overlayBounds));
          } else {
            // Check if heatmapPane exists, create if not
            let pane = mapInstanceRef.current!.getPane('heatmapPane');
            if (!pane) {
              mapInstanceRef.current!.createPane('heatmapPane');
              pane = mapInstanceRef.current!.getPane('heatmapPane');
              if (pane) {
                pane.style.zIndex = '450';
              }
            }
            
            canvasOverlayRef.current = L.imageOverlay(url, overlayBounds, {
              opacity: 1, // Opacity is baked into the canvas
              interactive: false,
              pane: 'heatmapPane', // Use custom pane for proper z-ordering
            }).addTo(mapInstanceRef.current!);
          }

          const endTime = performance.now();
          console.log(`Canvas rendered: ${canvas.width}x${canvas.height} for ${uniqueLngs}x${uniqueLats} grid in ${(endTime - startTime).toFixed(1)}ms`);
        }, 'image/png');

      } catch (error) {
        console.error('Error updating grid:', error);
      }
    };

    updateGrid();
  }, [mapReady, heatmapPoints, heatmapOpacity]);

  // Ensure canvas overlay stays in sync with map view
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    
    // Force overlay to update its position after zoom/move
    const handleViewChange = () => {
      if (canvasOverlayRef.current && map) {
        // Leaflet's ImageOverlay should auto-update, but we can force a redraw
        // by triggering a bounds update
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

  // Update POI markers when pois or showPOIs changes
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !poiLayerGroupRef.current) return;

    const updatePOIs = async () => {
      try {
        const L = (await import('leaflet')).default;

        if (!poiLayerGroupRef.current) return;

        // Clear existing markers
        poiLayerGroupRef.current.clearLayers();

        // Don't add markers if showPOIs is false
        if (!showPOIs) return;

        // Create a map of factor names for tooltips
        const factorNames: Record<string, string> = {};
        factors.forEach((f) => {
          factorNames[f.id] = f.name;
        });

        // Add markers for each POI
        Object.entries(pois).forEach(([factorId, poiList]) => {
          const color = POI_COLORS[factorId] || '#6b7280';
          const factorName = factorNames[factorId] || factorId;

          poiList.forEach((poi) => {
            // Create a circle marker with the factor's color
            const marker = L.circleMarker([poi.lat, poi.lng], {
              radius: 6,
              fillColor: color,
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.8,
            });

            // Add tooltip with POI info
            const tooltipContent = poi.name 
              ? `<strong>${poi.name}</strong><br/><span style="color: ${color}">${factorName}</span>`
              : `<span style="color: ${color}">${factorName}</span>`;
            
            marker.bindTooltip(tooltipContent, {
              direction: 'top',
              offset: [0, -8],
            });

            marker.addTo(poiLayerGroupRef.current!);
          });
        });
      } catch (error) {
        console.error('Error updating POI markers:', error);
      }
    };

    updatePOIs();
  }, [mapReady, pois, showPOIs, factors]);

  // Update property markers when properties or showProperties changes
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !propertyLayerGroupRef.current) return;

    const updateProperties = async () => {
      try {
        const L = (await import('leaflet')).default;

        if (!propertyLayerGroupRef.current) return;

        // Hide layer if showProperties is false
        if (!showProperties) {
          propertyLayerGroupRef.current.clearLayers();
          propertyMarkersRef.current.clear();
          clusterMarkersRef.current.clear();
          return;
        }

        // Track which cluster IDs we've seen in this update
        const currentClusterIds = new Set<string>();

        // Track which property IDs we've seen
        const currentIds = new Set<number>();

        // Create custom icon for properties based on estate type
        const createPropertyIcon = (estateType: EstateType) => {
          return L.divIcon({
            className: getPropertyMarkerClassName(estateType),
            html: generatePropertyMarkerHtml(estateType, 28),
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28],
          });
        };

        // Add or update property markers
        for (const property of properties) {
          currentIds.add(property.id);

          // Check if marker already exists
          const existingMarker = propertyMarkersRef.current.get(property.id);
          if (existingMarker) {
            continue;
          }

          const pricePerMeter = property.areaInSquareMeters > 0
            ? Math.round(property.totalPrice.value / property.areaInSquareMeters)
            : null;

          // Create image gallery HTML if multiple images
          const imageCount = property.images.length;
          const galleryId = `gallery-${property.id}`;
          let imageHtml = '';

          // Property type badge
          const isHouse = property.estate === 'HOUSE';
          const typeBadgeColor = isHouse ? '#16a34a' : '#3b82f6';
          const typeBadgeText = isHouse ? 'Dom' : 'Mieszkanie';
          
          if (imageCount > 0) {
            const imagesJson = JSON.stringify(property.images.map(img => img.medium)).replace(/"/g, '&quot;');
            imageHtml = `
              <div style="position: relative; background: #f3f4f6; border-radius: 8px 8px 0 0; overflow: hidden;">
                <img 
                  id="${galleryId}-img" 
                  src="${property.images[0].medium}" 
                  alt="" 
                  style="width: 100%; height: auto; max-height: 180px; object-fit: contain; display: block;" 
                  onerror="this.style.display='none'" 
                />
                <!-- Property type badge -->
                <div style="position: absolute; top: 8px; left: 8px; background: ${typeBadgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                  ${typeBadgeText}
                </div>
                ${imageCount > 1 ? `
                  <!-- Left button - centered between close button area and bottom -->
                  <button 
                    onclick="(function(){
                      var imgs = ${imagesJson};
                      var img = document.getElementById('${galleryId}-img');
                      var counter = document.getElementById('${galleryId}-counter');
                      var idx = parseInt(counter.textContent) - 1;
                      idx = (idx - 1 + imgs.length) % imgs.length;
                      img.src = imgs[idx];
                      counter.textContent = idx + 1;
                    })()"
                    style="position: absolute; left: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"
                  >‹</button>
                  <!-- Counter at bottom center -->
                  <span id="${galleryId}-counter" style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px;">1/${imageCount}</span>
                  <!-- Right button - centered between close button area and bottom -->
                  <button 
                    onclick="(function(){
                      var imgs = ${imagesJson};
                      var img = document.getElementById('${galleryId}-img');
                      var counter = document.getElementById('${galleryId}-counter');
                      var idx = parseInt(counter.textContent.split('/')[0]) - 1;
                      idx = (idx + 1) % imgs.length;
                      img.src = imgs[idx];
                      counter.textContent = (idx + 1) + '/${imageCount}';
                    })()"
                    style="position: absolute; right: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"
                  >›</button>
                ` : ''}
              </div>
            `;
          }

          // Format rooms display
          const roomsDisplay = property.roomsNumber ? roomCountToNumber(property.roomsNumber) : null;

          const popupContent = `
            <div style="min-width: 220px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
              ${imageHtml}
              <div style="padding: 12px;">
                <!-- Title as link -->
                <a 
                  href="${property.url}" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style="display: flex; align-items: flex-start; gap: 4px; font-weight: 600; font-size: 13px; margin-bottom: 6px; line-height: 1.3; color: #1f2937; text-decoration: none;"
                >
                  <span style="flex: 1; max-height: 2.6em; overflow: hidden;">${property.title}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
                <!-- Price -->
                <div style="font-size: 16px; font-weight: 700; color: #16a34a; margin-bottom: 8px;">
                  ${property.hidePrice ? 'Cena do negocjacji' : formatPrice(property.totalPrice.value, property.totalPrice.currency)}
                </div>
                <!-- Property details -->
                <div style="display: flex; align-items: center; gap: 4px; color: #4b5563; font-size: 12px;">
                  <span style="font-weight: 500;">${property.areaInSquareMeters} m²</span>
                  ${roomsDisplay ? `<span style="color: #9ca3af;">•</span><span style="font-weight: 500;">${roomsDisplay} pok.</span>` : ''}
                  ${pricePerMeter ? `<span style="color: #9ca3af;">•</span><span style="color: #6b7280;">${pricePerMeter.toLocaleString('pl-PL')} PLN/m²</span>` : ''}
                </div>
              </div>
            </div>
          `;

          // Create new marker with estate-type-specific icon
          const marker = L.marker([property.lat, property.lng], {
            icon: createPropertyIcon(property.estate),
          });

          marker.bindPopup(popupContent, {
            maxWidth: 280,
            className: 'property-popup',
          });

          // Close any existing popup (especially cluster popups with autoClose: false) and open this one
          marker.on('click', (e) => {
            // Prevent default popup behavior
            e.originalEvent?.preventDefault();
            // Close any existing popup first
            mapInstanceRef.current?.closePopup();
            // Then open this marker's popup
            marker.openPopup();
          });

          marker.addTo(propertyLayerGroupRef.current);
          propertyMarkersRef.current.set(property.id, marker);
        }

        // Remove property markers that are no longer in the list
        for (const [id, marker] of propertyMarkersRef.current) {
          if (!currentIds.has(id)) {
            propertyLayerGroupRef.current.removeLayer(marker);
            propertyMarkersRef.current.delete(id);
          }
        }

        // Add cluster markers (when zoomed out)
        for (const cluster of propertyClusters) {
          const clusterId = `cluster-${cluster.lat.toFixed(6)}-${cluster.lng.toFixed(6)}`;
          currentClusterIds.add(clusterId);
          
          // Check if cluster marker already exists - skip if it does to preserve popup state
          if (clusterMarkersRef.current.has(clusterId)) {
            continue;
          }
          
          // Create cluster icon with count
          const clusterIcon = L.divIcon({
            className: 'property-cluster-marker',
            html: `
              <div style="
                min-width: 36px;
                height: 36px;
                background: #3b82f6;
                border: 3px solid white;
                border-radius: 18px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 8px;
                cursor: pointer;
              ">
                <span style="color: white; font-weight: 700; font-size: 12px;">${cluster.count}</span>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

          const clusterMarker = L.marker([cluster.lat, cluster.lng], {
            icon: clusterIcon,
          });

          // Generate popup HTML for a single property in the cluster with image gallery
          const generateClusterPropertyHtml = (
            property: OtodomProperty,
            currentIndex: number,
            totalCount: number,
            fetchedCount: number,
            imageIndex: number = 0
          ): string => {
            const isHouse = property.estate === 'HOUSE';
            const typeBadgeColor = isHouse ? '#16a34a' : '#3b82f6';
            const typeBadgeText = isHouse ? 'Dom' : 'Mieszkanie';
            const roomsDisplay = property.roomsNumber ? roomCountToNumber(property.roomsNumber) : null;
            const pricePerMeter = property.areaInSquareMeters > 0
              ? Math.round(property.totalPrice.value / property.areaInSquareMeters)
              : null;
            
            const hasMultipleImages = property.images.length > 1;
            const currentImage = property.images[imageIndex] || property.images[0];
            
            // Show "X / Y" where X is current position and Y is total
            // If we have more properties than fetched, show "X / Y (Z loaded)"
            const paginationText = fetchedCount < totalCount 
              ? `${currentIndex + 1} / ${totalCount}`
              : `${currentIndex + 1} / ${totalCount}`;
            
            // Disable next button when we've reached the end of fetched properties
            const isAtEnd = currentIndex >= fetchedCount - 1;

            const imageHtml = property.images.length > 0 ? `
              <div style="position: relative; background: #f3f4f6; border-radius: 8px 8px 0 0; overflow: hidden;">
                <img 
                  id="${clusterId}-img"
                  src="${currentImage.medium}" 
                  alt="" 
                  style="width: 100%; height: 160px; object-fit: cover; display: block;" 
                  onerror="this.style.display='none'" 
                />
                <div style="position: absolute; top: 8px; left: 8px; background: ${typeBadgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                  ${typeBadgeText}
                </div>
                ${hasMultipleImages ? `
                  <!-- Left button - centered between close button area and bottom -->
                  <button 
                    id="${clusterId}-img-prev"
                    style="position: absolute; left: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; ${imageIndex === 0 ? 'opacity: 0.3;' : ''}"
                  >‹</button>
                  <!-- Counter at bottom center -->
                  <span style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${imageIndex + 1}/${property.images.length}</span>
                  <!-- Right button - centered between close button area and bottom -->
                  <button 
                    id="${clusterId}-img-next"
                    style="position: absolute; right: 8px; top: calc(50% + 12px); transform: translateY(-50%); background: rgba(0,0,0,0.5); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center; ${imageIndex >= property.images.length - 1 ? 'opacity: 0.3;' : ''}"
                  >›</button>
                ` : ''}
              </div>
            ` : `
              <div style="background: #f3f4f6; border-radius: 8px 8px 0 0; padding: 20px; text-align: center;">
                <div style="display: inline-block; background: ${typeBadgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">
                  ${typeBadgeText}
                </div>
              </div>
            `;

            return `
              <div style="min-width: 240px; max-width: 280px; font-family: system-ui, -apple-system, sans-serif; font-size: 12px;">
                ${imageHtml}
                <div style="padding: 12px;">
                  <!-- Title as link -->
                  <a 
                    href="${property.url}" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style="display: flex; align-items: flex-start; gap: 4px; font-weight: 600; font-size: 12px; margin-bottom: 6px; line-height: 1.3; color: #1f2937; text-decoration: none;"
                  >
                    <span style="flex: 1; max-height: 2.6em; overflow: hidden;">${property.title}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </a>
                  <div style="font-size: 15px; font-weight: 700; color: #16a34a; margin-bottom: 6px;">
                    ${property.hidePrice ? 'Cena do negocjacji' : `${property.totalPrice.value.toLocaleString('pl-PL')} ${property.totalPrice.currency}`}
                  </div>
                  <div style="display: flex; align-items: center; gap: 4px; color: #4b5563; margin-bottom: 8px; font-size: 11px;">
                    <span style="font-weight: 500;">${property.areaInSquareMeters} m²</span>
                    ${roomsDisplay ? `<span style="color: #9ca3af;">•</span><span style="font-weight: 500;">${roomsDisplay} pok.</span>` : ''}
                    ${pricePerMeter ? `<span style="color: #9ca3af;">•</span><span style="color: #6b7280;">${pricePerMeter.toLocaleString('pl-PL')} PLN/m²</span>` : ''}
                  </div>
                  
                  <!-- Subtle pagination at bottom -->
                  <div style="display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 8px; border-top: 1px solid #f3f4f6;">
                    <button 
                      id="${clusterId}-prev"
                      style="background: none; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; color: ${currentIndex === 0 ? '#d1d5db' : '#6b7280'}; ${currentIndex === 0 ? 'cursor: default;' : ''}"
                    >‹</button>
                    <span style="font-size: 11px; color: #9ca3af;">${paginationText}</span>
                    <button 
                      id="${clusterId}-next"
                      style="background: none; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; color: ${isAtEnd ? '#d1d5db' : '#6b7280'}; ${isAtEnd ? 'cursor: default;' : ''}"
                    >›</button>
                  </div>
                </div>
              </div>
            `;
          };

          // Loading popup HTML
          const loadingPopupHtml = `
            <div style="min-width: 200px; padding: 24px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
              <div style="display: inline-block; width: 24px; height: 24px; border: 2px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <div style="margin-top: 12px; color: #6b7280; font-size: 12px;">Ładowanie ${cluster.count} ofert...</div>
              <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            </div>
          `;

          // Error popup HTML
          const errorPopupHtml = (message: string) => `
            <div style="min-width: 200px; padding: 24px; text-align: center; font-family: system-ui, -apple-system, sans-serif;">
              <div style="color: #ef4444; font-size: 12px; margin-bottom: 12px;">${message}</div>
              <a 
                href="https://www.otodom.pl/pl/wyniki/sprzedaz/mieszkanie/poznan?viewType=listing" 
                target="_blank" 
                rel="noopener noreferrer"
                style="display: inline-block; background: #3b82f6; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 11px; font-weight: 500;"
              >
                Zobacz na Otodom
              </a>
            </div>
          `;

          // Click handler for cluster
          clusterMarker.on('click', async () => {
            // Close any existing popup before opening new one
            mapInstanceRef.current?.closePopup();
            
            // Show loading popup
            clusterMarker.unbindPopup();
            clusterMarker.bindPopup(loadingPopupHtml, { 
              className: 'cluster-popup',
              maxWidth: 300,
              closeOnClick: false,
              autoClose: false,
            }).openPopup();

            try {
              // Fetch cluster properties using the cluster's actual shape polygon if available
              // Also pass the estate type to get accurate counts matching the cluster
              const response = await fetch('/api/properties/cluster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  lat: cluster.lat,
                  lng: cluster.lng,
                  filters: propertyFilters,
                  page: 1,
                  limit: Math.min(cluster.count, 500), // Fetch up to cluster count, max 500
                  shape: cluster.shape, // Use actual cluster boundary polygon
                  radius: cluster.radiusInMeters || 1000, // Fallback radius
                  estateType: cluster.estateType, // Fetch only this estate type for accurate count
                }),
              });

              if (!response.ok) {
                throw new Error('Failed to fetch properties');
              }

              const data: ClusterPropertiesResponse = await response.json();
              
              if (data.properties.length === 0) {
                clusterMarker.setPopupContent(errorPopupHtml('Nie znaleziono ofert w tym obszarze'));
                return;
              }

              // Store properties in window for navigation
              const windowKey = `__cluster_${clusterId.replace(/[^a-zA-Z0-9]/g, '_')}`;
              (window as unknown as Record<string, OtodomProperty[]>)[windowKey] = data.properties;
              
              // Use the actual total count from API, not just fetched properties length
              const actualTotalCount = data.totalCount;
              const fetchedCount = data.properties.length;

              let currentPropertyIndex = 0;
              let currentImageIndex = 0;

              // Function to update popup content and attach event listeners
              const updatePopup = () => {
                const props = (window as unknown as Record<string, OtodomProperty[]>)[windowKey];
                if (!props || props.length === 0) return;
                
                // Show actual total count in pagination, but navigate only through fetched properties
                const html = generateClusterPropertyHtml(props[currentPropertyIndex], currentPropertyIndex, actualTotalCount, fetchedCount, currentImageIndex);
                clusterMarker.setPopupContent(html);

                // Re-attach event listeners after DOM update
                setTimeout(() => {
                  // Property navigation buttons
                  const prevBtn = document.getElementById(`${clusterId}-prev`);
                  const nextBtn = document.getElementById(`${clusterId}-next`);
                  
                  if (prevBtn) {
                    prevBtn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (currentPropertyIndex > 0) {
                        currentPropertyIndex--;
                        currentImageIndex = 0; // Reset image index when changing property
                        updatePopup();
                      }
                    };
                  }
                  
                  if (nextBtn) {
                    nextBtn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Navigate only through fetched properties
                      if (currentPropertyIndex < fetchedCount - 1) {
                        currentPropertyIndex++;
                        currentImageIndex = 0; // Reset image index when changing property
                        updatePopup();
                      }
                    };
                  }

                  // Image gallery navigation buttons
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

              // Show first property
              updatePopup();

            } catch (error) {
              console.error('Error fetching cluster properties:', error);
              clusterMarker.setPopupContent(errorPopupHtml('Błąd ładowania ofert'));
            }
          });

          clusterMarker.addTo(propertyLayerGroupRef.current);
          clusterMarkersRef.current.set(clusterId, clusterMarker);
        }

        // Remove cluster markers that are no longer in the list
        for (const [id, marker] of clusterMarkersRef.current) {
          if (!currentClusterIds.has(id)) {
            propertyLayerGroupRef.current.removeLayer(marker);
            clusterMarkersRef.current.delete(id);
          }
        }
      } catch (error) {
        console.error('Error updating property markers:', error);
      }
    };

    updateProperties();
  }, [mapReady, properties, propertyClusters, showProperties, propertyFilters]);

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
