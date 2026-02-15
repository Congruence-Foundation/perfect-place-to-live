'use client';

/**
 * Hook for managing the user's live location marker on the map
 * Uses watchPosition for continuous location tracking
 */

import { useEffect, useRef } from 'react';
import { useMapStore, type UserLocation } from '@/stores/mapStore';
import { UI_CONFIG } from '@/constants/performance';
import { Z_INDEX } from '@/constants/z-index';

// Location marker styling constants
const LOCATION_MARKER_SIZE = 16; // Total size including border
const LOCATION_MARKER_COLOR = '#4285F4'; // Google Maps blue
const ACCURACY_CIRCLE_FILL_OPACITY = 0.15;
const ACCURACY_CIRCLE_STROKE_OPACITY = 0.3;

// Pane name for location marker (above heatmap and tile borders)
const LOCATION_PANE_NAME = 'locationMarkerPane';

interface UseLocationMarkerOptions {
  mapReady: boolean;
  mapInstance: L.Map | null;
}

/**
 * Ensure a Leaflet pane exists, creating it with the given z-index if needed.
 */
function ensurePane(map: L.Map, name: string, zIndex: number): HTMLElement | undefined {
  let pane = map.getPane(name);
  if (!pane) {
    map.createPane(name);
    pane = map.getPane(name);
    if (pane) pane.style.zIndex = String(zIndex);
  }
  return pane;
}

/**
 * Create the HTML for the location marker dot.
 * Uses inline styles for consistent rendering across all browsers.
 */
function createLocationMarkerHtml(): string {
  return `<div style="
    width: 16px;
    height: 16px;
    background-color: #4285F4;
    border: 3px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  "></div>`;
}

/**
 * Hook to display and update the user's location marker on the map
 * 
 * - Uses navigator.geolocation.watchPosition for continuous tracking
 * - Creates a pulsing blue dot marker with accuracy circle
 * - Uses L.divIcon for zoom-independent marker size
 * - Updates marker position as user moves
 * - Cleans up watch and markers on unmount
 */
export function useLocationMarker({
  mapReady,
  mapInstance,
}: UseLocationMarkerOptions): void {
  const locationLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const locationMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const isLocationEnabled = useMapStore((s) => s.isLocationEnabled);
  const setUserLocation = useMapStore((s) => s.setUserLocation);

  useEffect(() => {
    if (!mapReady || !mapInstance || !isLocationEnabled) {
      return;
    }

    let isActive = true;

    const initLocationTracking = async () => {
      if (!('geolocation' in navigator)) {
        console.warn('Geolocation is not supported by this browser');
        return;
      }

      const L = (await import('leaflet')).default;

      if (!isActive || !mapInstance) return;

      // Ensure the location pane exists with proper z-index
      ensurePane(mapInstance, LOCATION_PANE_NAME, Z_INDEX.MAP_LOCATION_MARKER_PANE);

      // Initialize layer group if needed, using the custom pane
      if (!locationLayerGroupRef.current) {
        locationLayerGroupRef.current = L.layerGroup([], { pane: LOCATION_PANE_NAME }).addTo(mapInstance);
      }

      // Create the divIcon for the location marker (doesn't scale on zoom)
      const locationIcon = L.divIcon({
        html: createLocationMarkerHtml(),
        className: '', // Empty to avoid Leaflet's default icon styling
        iconSize: [LOCATION_MARKER_SIZE, LOCATION_MARKER_SIZE],
        iconAnchor: [LOCATION_MARKER_SIZE / 2, LOCATION_MARKER_SIZE / 2],
      });

      const updateLocationMarker = (location: UserLocation) => {
        if (!isActive || !locationLayerGroupRef.current) return;

        const { lat, lng, accuracy } = location;

        // Update or create accuracy circle
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.setLatLng([lat, lng]);
          accuracyCircleRef.current.setRadius(accuracy);
        } else {
          accuracyCircleRef.current = L.circle([lat, lng], {
            radius: accuracy,
            fillColor: LOCATION_MARKER_COLOR,
            fillOpacity: ACCURACY_CIRCLE_FILL_OPACITY,
            color: LOCATION_MARKER_COLOR,
            opacity: ACCURACY_CIRCLE_STROKE_OPACITY,
            weight: 1,
            pane: LOCATION_PANE_NAME,
          }).addTo(locationLayerGroupRef.current);
        }

        // Update or create location marker
        if (locationMarkerRef.current) {
          locationMarkerRef.current.setLatLng([lat, lng]);
        } else {
          locationMarkerRef.current = L.marker([lat, lng], {
            icon: locationIcon,
            pane: LOCATION_PANE_NAME,
            interactive: false,
          }).addTo(locationLayerGroupRef.current);
        }
      };

      const handlePositionSuccess = (position: GeolocationPosition) => {
        if (!isActive) return;

        const location: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        setUserLocation(location);
        updateLocationMarker(location);
      };

      const handlePositionError = (error: GeolocationPositionError) => {
        console.warn('Geolocation error:', error.message);
      };

      // Start watching position
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionSuccess,
        handlePositionError,
        {
          enableHighAccuracy: true,
          timeout: UI_CONFIG.GEOLOCATION_TIMEOUT_MS,
          maximumAge: 0, // Always get fresh position for live tracking
        }
      );
    };

    initLocationTracking();

    return () => {
      isActive = false;

      // Clear the watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      // Clear markers
      locationMarkerRef.current = null;
      accuracyCircleRef.current = null;

      // Remove layer group
      if (locationLayerGroupRef.current) {
        locationLayerGroupRef.current.remove();
        locationLayerGroupRef.current = null;
      }

      // Clear location from store
      setUserLocation(null);
    };
  }, [mapReady, mapInstance, isLocationEnabled, setUserLocation]);
}
