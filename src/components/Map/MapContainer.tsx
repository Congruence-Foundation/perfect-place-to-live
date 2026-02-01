'use client';

import { useEffect, useState, forwardRef, useImperativeHandle, useRef, useMemo, useCallback, useContext } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { POLAND_CENTER } from '@/config/factors';
import { HeatmapPoint, POI, Factor, Bounds } from '@/types';
import type { PopupTranslations, FactorTranslations, MapViewRef } from './MapView';

// Dynamically import the map to avoid SSR issues with Leaflet
const MapWithNoSSR = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <div className="text-muted-foreground">Loading map...</div>
    </div>
  ),
});

export interface MapContainerRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (bounds: Bounds) => void;
  invalidateSize: () => void;
  getMap: () => L.Map | null;
  getExtensionLayerGroup: () => L.LayerGroup | null;
  getLeaflet: () => typeof import('leaflet') | null;
}

interface MapContainerProps {
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }, zoom: number) => void;
  heatmapPoints?: HeatmapPoint[];
  heatmapOpacity?: number;
  pois?: Record<string, POI[]>;
  showPOIs?: boolean;
  factors?: Factor[];
  /** Callback when map is ready with Leaflet instance and extension layer */
  onMapReady?: (map: L.Map, L: typeof import('leaflet'), extensionLayer: L.LayerGroup) => void;
}

const MapContainer = forwardRef<MapContainerRef, MapContainerProps>(({
  onBoundsChange,
  heatmapPoints = [],
  heatmapOpacity = 0.6,
  pois = {},
  showPOIs = false,
  factors = [],
  onMapReady,
}, ref) => {
  const [isMounted, setIsMounted] = useState(false);
  const mapViewRef = useRef<MapViewRef>(null);
  
  // Get translations for popup
  const tPopup = useTranslations('popup');
  const tFactors = useTranslations('factors');
  
  // Memoize popup translations object
  const popupTranslations: PopupTranslations = useMemo(() => ({
    excellent: tPopup('excellent'),
    good: tPopup('good'),
    average: tPopup('average'),
    belowAverage: tPopup('belowAverage'),
    poor: tPopup('poor'),
    footer: tPopup('footer'),
    goodLabel: tPopup('goodLabel'),
    improveLabel: tPopup('improveLabel'),
    noData: tPopup('noData'),
  }), [tPopup]);
  
  // Memoize factor translations object
  const factorTranslations: FactorTranslations = useMemo(() => ({
    grocery: tFactors('grocery'),
    transit: tFactors('transit'),
    healthcare: tFactors('healthcare'),
    parks: tFactors('parks'),
    schools: tFactors('schools'),
    post: tFactors('post'),
    restaurants: tFactors('restaurants'),
    banks: tFactors('banks'),
    gyms: tFactors('gyms'),
    playgrounds: tFactors('playgrounds'),
    stadiums: tFactors('stadiums'),
    nightlife: tFactors('nightlife'),
    universities: tFactors('universities'),
    religious: tFactors('religious'),
    dog_parks: tFactors('dog_parks'),
    coworking: tFactors('coworking'),
    cinemas: tFactors('cinemas'),
    markets: tFactors('markets'),
    water: tFactors('water'),
    industrial: tFactors('industrial'),
    highways: tFactors('highways'),
    airports: tFactors('airports'),
    railways: tFactors('railways'),
    cemeteries: tFactors('cemeteries'),
    construction: tFactors('construction'),
  }), [tFactors]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, zoom?: number) => {
      mapViewRef.current?.flyTo(lat, lng, zoom);
    },
    fitBounds: (bounds: Bounds) => {
      mapViewRef.current?.fitBounds(bounds);
    },
    invalidateSize: () => {
      mapViewRef.current?.invalidateSize();
    },
    getMap: () => mapViewRef.current?.getMap() ?? null,
    getExtensionLayerGroup: () => mapViewRef.current?.getExtensionLayerGroup() ?? null,
    getLeaflet: () => mapViewRef.current?.getLeaflet() ?? null,
  }));

  if (!isMounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted">
        <div className="text-muted-foreground">Loading map...</div>
      </div>
    );
  }

  return (
    <MapWithNoSSR
      ref={mapViewRef}
      center={[POLAND_CENTER.lat, POLAND_CENTER.lng]}
      zoom={7}
      onBoundsChange={onBoundsChange}
      heatmapPoints={heatmapPoints}
      heatmapOpacity={heatmapOpacity}
      pois={pois}
      showPOIs={showPOIs}
      factors={factors}
      popupTranslations={popupTranslations}
      factorTranslations={factorTranslations}
      onMapReady={onMapReady}
    />
  );
});

MapContainer.displayName = 'MapContainer';

export default MapContainer;
