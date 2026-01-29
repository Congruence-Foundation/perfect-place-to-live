'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';

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

// POI marker colors by category
const POI_COLORS: Record<string, string> = {
  grocery: '#22c55e',      // green
  transit: '#3b82f6',      // blue
  healthcare: '#ef4444',   // red
  parks: '#84cc16',        // lime
  schools: '#f59e0b',      // amber
  post: '#8b5cf6',         // violet
  restaurants: '#ec4899',  // pink
  banks: '#14b8a6',        // teal
  gyms: '#f97316',         // orange
  playgrounds: '#a855f7',  // purple
  industrial: '#6b7280',   // gray
  highways: '#374151',     // dark gray
  stadiums: '#dc2626',     // red
  nightlife: '#7c3aed',    // violet
  universities: '#0891b2', // cyan
  religious: '#ca8a04',    // yellow
  dog_parks: '#65a30d',    // lime
  coworking: '#0284c7',    // sky
  cinemas: '#be185d',      // pink
  markets: '#ea580c',      // orange
  water: '#0ea5e9',        // sky
  airports: '#64748b',     // slate
  railways: '#78716c',     // stone
  cemeteries: '#57534e',   // stone
  construction: '#fbbf24', // amber
};

// Color interpolation for K values
// Uses ABSOLUTE K values (not normalized) so colors are consistent
function getColorForK(k: number): string {
  // Color stops: green (good, low K) to red (bad, high K)
  // K is 0-1 where 0 = excellent, 1 = poor
  const colors = [
    { pos: 0, r: 22, g: 163, b: 74 },    // green-600 - excellent (K=0)
    { pos: 0.25, r: 101, g: 163, b: 13 }, // lime-600
    { pos: 0.5, r: 202, g: 138, b: 4 },   // yellow-600
    { pos: 0.75, r: 234, g: 88, b: 12 },  // orange-600
    { pos: 1, r: 220, g: 38, b: 38 },     // red-600 - poor (K=1)
  ];
  
  // Clamp K to 0-1 range
  const normalized = Math.max(0, Math.min(1, k));
  
  // Find the two colors to interpolate between
  let lower = colors[0];
  let upper = colors[colors.length - 1];
  
  for (let i = 0; i < colors.length - 1; i++) {
    if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {
      lower = colors[i];
      upper = colors[i + 1];
      break;
    }
  }
  
  // Interpolate
  const range = upper.pos - lower.pos;
  const t = range > 0 ? (normalized - lower.pos) / range : 0;
  
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);
  
  return `rgb(${r},${g},${b})`;
}

// Get rating label for K value
function getRatingLabel(k: number, translations: PopupTranslations): { label: string; emoji: string } {
  if (k < 0.2) return { label: translations.excellent, emoji: '🌟' };
  if (k < 0.4) return { label: translations.good, emoji: '👍' };
  if (k < 0.6) return { label: translations.average, emoji: '😐' };
  if (k < 0.8) return { label: translations.belowAverage, emoji: '👎' };
  return { label: translations.poor, emoji: '⚠️' };
}

// Format distance for display
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

// Haversine distance calculation (simplified)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate factor breakdown for a point
interface FactorBreakdown {
  factorId: string;
  factorName: string;
  color: string;
  distance: number;
  maxDistance: number;
  score: number; // 0-1, lower is better
  isNegative: boolean; // derived from weight sign
  weight: number;
  contribution: number; // weighted contribution to final K
  noPOIs: boolean;
  nearbyCount: number; // count of POIs within maxDistance
}

function calculateFactorBreakdown(
  lat: number,
  lng: number,
  factors: Factor[],
  pois: Record<string, POI[]>
): { k: number; breakdown: FactorBreakdown[] } {
  const breakdown: FactorBreakdown[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const factor of factors) {
    if (!factor.enabled || factor.weight === 0) continue;

    const factorPOIs = pois[factor.id] || [];
    const color = POI_COLORS[factor.id] || '#6b7280';
    const isNegative = factor.weight < 0;
    const absWeight = Math.abs(factor.weight);
    
    let nearestDistance = Infinity;
    let noPOIs = false;
    let nearbyCount = 0;

    if (factorPOIs.length === 0) {
      noPOIs = true;
      nearestDistance = factor.maxDistance;
    } else {
      // Find nearest POI and count nearby POIs
      for (const poi of factorPOIs) {
        const dist = haversineDistance(lat, lng, poi.lat, poi.lng);
        if (dist < nearestDistance) {
          nearestDistance = dist;
        }
        // Count POIs within maxDistance
        if (dist <= factor.maxDistance) {
          nearbyCount++;
        }
      }
    }

    const cappedDistance = Math.min(nearestDistance, factor.maxDistance);
    const normalizedDistance = cappedDistance / factor.maxDistance;
    
    // Score: 0 = good, 1 = bad
    let score: number;
    if (noPOIs) {
      score = isNegative ? 0 : 1;
    } else {
      score = isNegative ? (1 - normalizedDistance) : normalizedDistance;
    }

    const contribution = score * absWeight;
    weightedSum += contribution;
    totalWeight += absWeight;

    breakdown.push({
      factorId: factor.id,
      factorName: factor.name,
      color,
      distance: nearestDistance,
      maxDistance: factor.maxDistance,
      score,
      isNegative,
      weight: factor.weight,
      contribution,
      noPOIs,
      nearbyCount,
    });
  }

  const k = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  
  // Sort by contribution (highest impact first)
  breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { k, breakdown };
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
          <div style="width: 6px; height: 6px; border-radius: 50%; background: ${item.color};"></div>
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
  const [mapReady, setMapReady] = useState(false);
  const initializingRef = useRef(false);
  
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
    
    L.popup({
      maxWidth: 300,
      className: 'location-rating-popup',
    })
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
          } catch (e) {
            // Ignore errors during cleanup
          }
        };

        map.on('moveend', handleBoundsChange);
        map.on('zoomend', handleBoundsChange);
        
        // Add right-click (context menu) handler for location details popup
        map.on('contextmenu', handleMapClick);

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
        } catch (e) {
          // Ignore cleanup errors
        }
        mapInstanceRef.current = null;
        gridLayerRef.current = null;
        poiLayerGroupRef.current = null;
      }
      initializingRef.current = false;
      setMapReady(false);
    };
  }, [handleMapClick]); // Include handleMapClick in deps

  // Update grid overlay when points change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !gridLayerRef.current) return;

    const updateGrid = async () => {
      try {
        const L = (await import('leaflet')).default;

        if (!mapInstanceRef.current || !gridLayerRef.current) return;

        // Clear existing grid
        gridLayerRef.current.clearLayers();

        if (heatmapPoints.length === 0) return;

        // Find min/max K values for logging
        let minK = Infinity, maxK = -Infinity;
        for (const point of heatmapPoints) {
          if (point.value < minK) minK = point.value;
          if (point.value > maxK) maxK = point.value;
        }
        
        console.log(`Grid K range: min=${minK.toFixed(3)}, max=${maxK.toFixed(3)}`);

        // Estimate cell size from point spacing
        // Find average distance between adjacent points
        let cellSizeLat = 0.001; // default
        let cellSizeLng = 0.001;
        
        if (heatmapPoints.length > 1) {
          // Sort points to find grid spacing
          const sortedByLat = [...heatmapPoints].sort((a, b) => a.lat - b.lat);
          const sortedByLng = [...heatmapPoints].sort((a, b) => a.lng - b.lng);
          
          // Find minimum non-zero differences
          for (let i = 1; i < sortedByLat.length; i++) {
            const diff = sortedByLat[i].lat - sortedByLat[i-1].lat;
            if (diff > 0.0001) {
              cellSizeLat = diff;
              break;
            }
          }
          for (let i = 1; i < sortedByLng.length; i++) {
            const diff = sortedByLng[i].lng - sortedByLng[i-1].lng;
            if (diff > 0.0001) {
              cellSizeLng = diff;
              break;
            }
          }
        }

        // Create rectangles for each grid cell
        const halfLat = cellSizeLat / 2;
        const halfLng = cellSizeLng / 2;

        for (const point of heatmapPoints) {
          // Use absolute K value for color (not normalized)
          const color = getColorForK(point.value);
          
          const bounds: L.LatLngBoundsExpression = [
            [point.lat - halfLat, point.lng - halfLng],
            [point.lat + halfLat, point.lng + halfLng],
          ];

          const rect = L.rectangle(bounds, {
            color: color,
            fillColor: color,
            fillOpacity: heatmapOpacity,
            weight: 0,
            stroke: false,
          });

          rect.addTo(gridLayerRef.current!);
        }
      } catch (error) {
        console.error('Error updating grid:', error);
      }
    };

    updateGrid();
  }, [mapReady, heatmapPoints, heatmapOpacity]);

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
