'use client';

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  OtodomProperty,
  PropertyFilters,
  PropertyCluster,
  EnrichedProperty,
  PriceValueRange,
} from './types';
import { DEFAULT_PROPERTY_FILTERS } from './types';
import type { PropertyDataSource } from './config';
import type { ClusterAnalysisMap } from './lib';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';

/**
 * Real estate store state interface
 */
export interface RealEstateState {
  // Core state
  enabled: boolean;
  filters: PropertyFilters;
  scoreRange: [number, number];
  priceValueRange: PriceValueRange;
  dataSources: PropertyDataSource[];
  
  // Tile-based fetching settings
  priceAnalysisRadius: number; // 0, 1, or 2 tile layers around viewport
  
  // Raw API data (now populated by useTileQueries)
  rawProperties: OtodomProperty[];
  rawClusters: PropertyCluster[];
  totalCount: number;
  
  // Computed/filtered data (set by controller)
  properties: EnrichedProperty[];
  clusters: PropertyCluster[];
  clusterAnalysisData: ClusterAnalysisMap;
  
  // API state
  isLoading: boolean;
  isTooLarge: boolean; // Viewport too large for tile fetching
  isBelowMinZoom: boolean; // Zoom level below minimum display threshold
  error: string | null;
  
  // Cache
  clusterPropertiesCache: Map<string, OtodomProperty[]>;
  cacheVersion: number;
}

/**
 * Real estate store actions interface
 */
export interface RealEstateActions {
  // Core actions
  setEnabled: (enabled: boolean) => void;
  setFilters: (filters: Partial<PropertyFilters>) => void;
  setScoreRange: (range: [number, number]) => void;
  setPriceValueRange: (range: PriceValueRange) => void;
  setDataSources: (sources: PropertyDataSource[]) => void;
  setPriceAnalysisRadius: (radius: number) => void;
  
  // Data actions
  setRawData: (properties: OtodomProperty[], clusters: PropertyCluster[], totalCount: number) => void;
  setComputedData: (properties: EnrichedProperty[], clusters: PropertyCluster[], analysisData: ClusterAnalysisMap) => void;
  
  // API state actions
  setIsLoading: (loading: boolean) => void;
  setIsTooLarge: (isTooLarge: boolean) => void;
  setIsBelowMinZoom: (isBelowMinZoom: boolean) => void;
  setError: (error: string | null) => void;
  
  // Cache actions
  cacheClusterProperties: (clusterId: string, properties: OtodomProperty[]) => void;
  clearCache: () => void;
  
  // Clear all
  clearProperties: () => void;
}

/**
 * Combined store type
 */
export type RealEstateStore = RealEstateState & RealEstateActions;

/**
 * Default initial state
 */
const initialState: RealEstateState = {
  enabled: false,
  filters: DEFAULT_PROPERTY_FILTERS,
  scoreRange: [50, 100],
  priceValueRange: [0, 100],
  dataSources: ['otodom'],
  priceAnalysisRadius: PROPERTY_TILE_CONFIG.DEFAULT_PRICE_RADIUS,
  rawProperties: [],
  rawClusters: [],
  totalCount: 0,
  properties: [],
  clusters: [],
  clusterAnalysisData: new Map(),
  isLoading: false,
  isTooLarge: false,
  isBelowMinZoom: false,
  error: null,
  clusterPropertiesCache: new Map(),
  cacheVersion: 0,
};

/**
 * Real estate extension store using Zustand
 * 
 * This store holds all state for the real estate extension:
 * - User preferences (enabled, filters, score range)
 * - Raw API data (properties, clusters)
 * - Computed/filtered data (enriched properties)
 * - Loading/error state
 * - Cluster properties cache
 */
export const useRealEstateStore = create<RealEstateStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      ...initialState,
      
      // Core actions
      setEnabled: (enabled) => set({ enabled }, false, 'setEnabled'),
      
      setFilters: (filters) => set(
        (state) => ({ filters: { ...state.filters, ...filters } }),
        false,
        'setFilters'
      ),
      
      setScoreRange: (scoreRange) => set({ scoreRange }, false, 'setScoreRange'),
      
      setPriceValueRange: (priceValueRange) => set({ priceValueRange }, false, 'setPriceValueRange'),
      
      setDataSources: (dataSources) => set({ dataSources }, false, 'setDataSources'),
      
      setPriceAnalysisRadius: (priceAnalysisRadius) => set(
        { priceAnalysisRadius: Math.min(Math.max(priceAnalysisRadius, 0), PROPERTY_TILE_CONFIG.MAX_PRICE_RADIUS) },
        false,
        'setPriceAnalysisRadius'
      ),
      
      // Data actions
      setRawData: (rawProperties, rawClusters, totalCount) => set(
        {
          rawProperties,
          rawClusters,
          totalCount,
          clusterPropertiesCache: new Map(),
          cacheVersion: get().cacheVersion + 1,
        },
        false,
        'setRawData'
      ),
      
      setComputedData: (properties, clusters, clusterAnalysisData) => set(
        { properties, clusters, clusterAnalysisData },
        false,
        'setComputedData'
      ),
      
      // API state actions
      setIsLoading: (isLoading) => set({ isLoading }, false, 'setIsLoading'),
      setIsTooLarge: (isTooLarge) => set({ isTooLarge }, false, 'setIsTooLarge'),
      setIsBelowMinZoom: (isBelowMinZoom) => set({ isBelowMinZoom }, false, 'setIsBelowMinZoom'),
      setError: (error) => set({ error }, false, 'setError'),
      
      // Cache actions
      cacheClusterProperties: (clusterId, properties) => set(
        (state) => {
          const newCache = new Map(state.clusterPropertiesCache);
          newCache.set(clusterId, properties);
          return {
            clusterPropertiesCache: newCache,
            cacheVersion: state.cacheVersion + 1,
          };
        },
        false,
        'cacheClusterProperties'
      ),
      
      clearCache: () => set(
        (state) => ({
          clusterPropertiesCache: new Map(),
          cacheVersion: state.cacheVersion + 1,
        }),
        false,
        'clearCache'
      ),
      
      // Clear all properties
      clearProperties: () => {
        set(
          {
            rawProperties: [],
            rawClusters: [],
            properties: [],
            clusters: [],
            totalCount: 0,
            error: null,
            isLoading: false,
            isTooLarge: false,
            clusterPropertiesCache: new Map(),
            clusterAnalysisData: new Map(),
            cacheVersion: get().cacheVersion + 1,
          },
          false,
          'clearProperties'
        );
      },
    })),
    { name: 'real-estate-store' }
  )
);