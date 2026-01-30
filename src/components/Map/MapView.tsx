'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import { POI_COLORS, getColorForK } from '@/constants';
import { formatDistance } from '@/lib/utils';
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
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
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
