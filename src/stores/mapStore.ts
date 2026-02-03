'use client';

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { Bounds, HeatmapPoint, POI, Factor, ClusterPriceAnalysisMode } from '@/types';
import type { ClusterPriceDisplay } from '@/extensions/real-estate/types';
import { HEATMAP_TILE_CONFIG, POI_TILE_CONFIG } from '@/constants/performance';

/**
 * Tile coordinate for debug rendering
 */
export interface DebugTileCoord {
  z: number;
  x: number;
  y: number;
}

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
  heatmapTileRadius: number;
  poiBufferScale: number;
  
  // Debug options
  showHeatmapTileBorders: boolean;
  showPropertyTileBorders: boolean;
  heatmapDebugTiles: DebugTileCoord[];
  extensionDebugTiles: DebugTileCoord[];
  
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
  setHeatmapTileRadius: (radius: number) => void;
  setPoiBufferScale: (scale: number) => void;
  setShowHeatmapTileBorders: (show: boolean) => void;
  setShowPropertyTileBorders: (show: boolean) => void;
  setHeatmapDebugTiles: (tiles: DebugTileCoord[]) => void;
  setExtensionDebugTiles: (tiles: DebugTileCoord[]) => void;
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
  heatmapTileRadius: HEATMAP_TILE_CONFIG.DEFAULT_TILE_RADIUS,
  poiBufferScale: POI_TILE_CONFIG.DEFAULT_POI_BUFFER_SCALE,
  showHeatmapTileBorders: false,
  showPropertyTileBorders: false,
  heatmapDebugTiles: [],
  extensionDebugTiles: [],
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
      setHeatmapTileRadius: (heatmapTileRadius) => set({ heatmapTileRadius }, false, 'setHeatmapTileRadius'),
      setPoiBufferScale: (poiBufferScale) => set({ poiBufferScale }, false, 'setPoiBufferScale'),
      setShowHeatmapTileBorders: (showHeatmapTileBorders) => set({ showHeatmapTileBorders }, false, 'setShowHeatmapTileBorders'),
      setShowPropertyTileBorders: (showPropertyTileBorders) => set({ showPropertyTileBorders }, false, 'setShowPropertyTileBorders'),
      setHeatmapDebugTiles: (heatmapDebugTiles) => set({ heatmapDebugTiles }, false, 'setHeatmapDebugTiles'),
      setExtensionDebugTiles: (extensionDebugTiles) => set({ extensionDebugTiles }, false, 'setExtensionDebugTiles'),
    })),
    { name: 'map-store' }
  )
);
