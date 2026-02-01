'use client';

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { Bounds, HeatmapPoint, POI, Factor, ClusterPriceAnalysisMode } from '@/types';
import type { ClusterPriceDisplay } from '@/types/property';

/**
 * Core map store state interface
 */
export interface MapState {
  // Map context
  bounds: Bounds | null;
  zoom: number;
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  factors: Factor[];
  gridCellSize: number;
  clusterPriceDisplay: ClusterPriceDisplay;
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  detailedModeThreshold: number;
  
  // Map instances (Leaflet)
  mapInstance: L.Map | null;
  leafletInstance: typeof import('leaflet') | null;
  extensionLayerGroup: L.LayerGroup | null;
  isMapReady: boolean;
}

/**
 * Map store actions interface
 */
export interface MapActions {
  // Bulk update
  setMapContext: (context: Partial<MapState>) => void;
  
  // Map ready
  setMapReady: (map: L.Map, L: typeof import('leaflet'), layerGroup: L.LayerGroup) => void;
  
  // Individual setters
  setBounds: (bounds: Bounds | null) => void;
  setZoom: (zoom: number) => void;
  setHeatmapPoints: (points: HeatmapPoint[]) => void;
  setPois: (pois: Record<string, POI[]>) => void;
  setFactors: (factors: Factor[]) => void;
  setGridCellSize: (size: number) => void;
  setClusterPriceDisplay: (display: ClusterPriceDisplay) => void;
  setClusterPriceAnalysis: (analysis: ClusterPriceAnalysisMode) => void;
  setDetailedModeThreshold: (threshold: number) => void;
}

/**
 * Combined store type
 */
export type MapStore = MapState & MapActions;

/**
 * Default initial state
 */
const initialState: MapState = {
  bounds: null,
  zoom: 7,
  heatmapPoints: [],
  pois: {},
  factors: [],
  gridCellSize: 200,
  clusterPriceDisplay: 'median',
  clusterPriceAnalysis: 'simplified',
  detailedModeThreshold: 100,
  mapInstance: null,
  leafletInstance: null,
  extensionLayerGroup: null,
  isMapReady: false,
};

/**
 * Core map store using Zustand
 * 
 * This store holds:
 * - Map context (bounds, zoom, heatmap data)
 * - Map instances (Leaflet map, library, layer group)
 * - Settings for extensions (grid size, price display modes)
 * 
 * Extensions can subscribe to this store to react to map changes.
 */
export const useMapStore = create<MapStore>()(
  devtools(
    subscribeWithSelector((set) => ({
      // Initial state
      ...initialState,
      
      // Bulk update action
      setMapContext: (context) => set(
        (state) => ({ ...state, ...context }),
        false,
        'setMapContext'
      ),
      
      // Set map as ready with all instances
      setMapReady: (map, L, layerGroup) => set(
        {
          mapInstance: map,
          leafletInstance: L,
          extensionLayerGroup: layerGroup,
          isMapReady: true,
        },
        false,
        'setMapReady'
      ),
      
      // Individual setters
      setBounds: (bounds) => set({ bounds }, false, 'setBounds'),
      setZoom: (zoom) => set({ zoom }, false, 'setZoom'),
      setHeatmapPoints: (heatmapPoints) => set({ heatmapPoints }, false, 'setHeatmapPoints'),
      setPois: (pois) => set({ pois }, false, 'setPois'),
      setFactors: (factors) => set({ factors }, false, 'setFactors'),
      setGridCellSize: (gridCellSize) => set({ gridCellSize }, false, 'setGridCellSize'),
      setClusterPriceDisplay: (clusterPriceDisplay) => set({ clusterPriceDisplay }, false, 'setClusterPriceDisplay'),
      setClusterPriceAnalysis: (clusterPriceAnalysis) => set({ clusterPriceAnalysis }, false, 'setClusterPriceAnalysis'),
      setDetailedModeThreshold: (detailedModeThreshold) => set({ detailedModeThreshold }, false, 'setDetailedModeThreshold'),
    })),
    { name: 'map-store' }
  )
);

/**
 * Selector hooks for common use cases
 */
export const useMapBounds = () => useMapStore((s) => s.bounds);
export const useMapZoom = () => useMapStore((s) => s.zoom);
export const useHeatmapPoints = () => useMapStore((s) => s.heatmapPoints);
export const useMapInstances = () => useMapStore((s) => ({
  map: s.mapInstance,
  L: s.leafletInstance,
  layerGroup: s.extensionLayerGroup,
  isReady: s.isMapReady,
}));
