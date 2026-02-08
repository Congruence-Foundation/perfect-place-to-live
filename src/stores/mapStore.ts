'use client';

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { Bounds, HeatmapPoint, Factor, ClusterPriceAnalysisMode, TileCoordinates, ClusterPriceDisplay } from '@/types';
import { HEATMAP_TILE_CONFIG, POI_TILE_CONFIG, UI_CONFIG } from '@/constants/performance';

/**
 * Core map store state interface
 */
export interface MapState {
  // Map context
  bounds: Bounds | null;
  zoom: number;
  heatmapPoints: HeatmapPoint[];
  factors: Factor[];
  gridCellSize: number;
  clusterPriceDisplay: ClusterPriceDisplay;
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  detailedModeThreshold: number;
  heatmapTileRadius: number;
  poiBufferScale: number;
  /** Whether to use progressive prefetch (true) or batch mode (false) */
  usePrefetchMode: boolean;
  
  // Debug options
  showHeatmapTileBorders: boolean;
  showPropertyTileBorders: boolean;
  heatmapDebugTiles: TileCoordinates[];
  extensionDebugTiles: TileCoordinates[];
  
  // Map instances (Leaflet)
  mapInstance: L.Map | null;
  leafletInstance: typeof import('leaflet') | null;
  extensionLayerGroup: L.LayerGroup | null;
  isMapReady: boolean;
  
  // Extension analytics progress (0-100, null when not calculating)
  analyticsProgress: number | null;
}

/**
 * Map store actions interface
 */
export interface MapActions {
  // Bulk update
  setMapContext: (context: Partial<MapState>) => void;
  
  // Map ready
  setMapReady: (map: L.Map, L: typeof import('leaflet'), layerGroup: L.LayerGroup) => void;
  
  // Individual setters (only those actually used)
  setHeatmapTileRadius: (radius: number) => void;
  setPoiBufferScale: (scale: number) => void;
  setUsePrefetchMode: (use: boolean) => void;
  setShowHeatmapTileBorders: (show: boolean) => void;
  setShowPropertyTileBorders: (show: boolean) => void;
  setHeatmapDebugTiles: (tiles: TileCoordinates[]) => void;
  setExtensionDebugTiles: (tiles: TileCoordinates[]) => void;
  setAnalyticsProgress: (progress: number | null) => void;
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
  zoom: UI_CONFIG.DEFAULT_INITIAL_ZOOM,
  heatmapPoints: [],
  factors: [],
  gridCellSize: UI_CONFIG.DEFAULT_GRID_CELL_SIZE,
  clusterPriceDisplay: 'median',
  clusterPriceAnalysis: 'simplified',
  detailedModeThreshold: UI_CONFIG.DEFAULT_DETAILED_MODE_THRESHOLD,
  heatmapTileRadius: HEATMAP_TILE_CONFIG.DEFAULT_TILE_RADIUS,
  poiBufferScale: POI_TILE_CONFIG.DEFAULT_POI_BUFFER_SCALE,
  usePrefetchMode: true,
  showHeatmapTileBorders: false,
  showPropertyTileBorders: false,
  heatmapDebugTiles: [],
  extensionDebugTiles: [],
  mapInstance: null,
  leafletInstance: null,
  extensionLayerGroup: null,
  isMapReady: false,
  analyticsProgress: null,
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
      
      // Bulk update action (Zustand's set() shallow-merges by default)
      setMapContext: (context) => set(context, false, 'setMapContext'),
      
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
      
      setHeatmapTileRadius: (heatmapTileRadius) => set({ heatmapTileRadius }, false, 'setHeatmapTileRadius'),
      setPoiBufferScale: (poiBufferScale) => set({ poiBufferScale }, false, 'setPoiBufferScale'),
      setUsePrefetchMode: (usePrefetchMode) => set({ usePrefetchMode }, false, 'setUsePrefetchMode'),
      setShowHeatmapTileBorders: (showHeatmapTileBorders) => set({ showHeatmapTileBorders }, false, 'setShowHeatmapTileBorders'),
      setShowPropertyTileBorders: (showPropertyTileBorders) => set({ showPropertyTileBorders }, false, 'setShowPropertyTileBorders'),
      setHeatmapDebugTiles: (heatmapDebugTiles) => set({ heatmapDebugTiles }, false, 'setHeatmapDebugTiles'),
      setExtensionDebugTiles: (extensionDebugTiles) => set({ extensionDebugTiles }, false, 'setExtensionDebugTiles'),
      setAnalyticsProgress: (analyticsProgress) => set({ analyticsProgress }, false, 'setAnalyticsProgress'),
    })),
    { name: 'map-store' }
  )
);
