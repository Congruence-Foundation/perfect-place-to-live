'use client';

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { Bounds } from '@/types';
import type {
  OtodomProperty,
  PropertyFilters,
  PropertyCluster,
  EnrichedProperty,
  PriceValueRange,
  PropertyResponse,
} from '@/types/property';
import { DEFAULT_PROPERTY_FILTERS } from '@/types/property';
import type { DataSource } from '@/components/Controls/DataSourcesPanel';
import type { ClusterAnalysisMap } from '@/lib/price-analysis';

/**
 * Real estate store state interface
 */
export interface RealEstateState {
  // Core state
  enabled: boolean;
  filters: PropertyFilters;
  scoreRange: [number, number];
  priceValueRange: PriceValueRange;
  dataSources: DataSource[];
  
  // Raw API data
  rawProperties: OtodomProperty[];
  rawClusters: PropertyCluster[];
  totalCount: number;
  
  // Computed/filtered data (set by controller)
  properties: EnrichedProperty[];
  clusters: PropertyCluster[];
  clusterAnalysisData: ClusterAnalysisMap;
  
  // API state
  isLoading: boolean;
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
  setDataSources: (sources: DataSource[]) => void;
  
  // Data actions
  setRawData: (properties: OtodomProperty[], clusters: PropertyCluster[], totalCount: number) => void;
  setComputedData: (properties: EnrichedProperty[], clusters: PropertyCluster[], analysisData: ClusterAnalysisMap) => void;
  
  // API state actions
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Cache actions
  cacheClusterProperties: (clusterId: string, properties: OtodomProperty[]) => void;
  clearCache: () => void;
  
  // Clear all
  clearProperties: () => void;
  
  // Fetch action (async)
  fetchProperties: (bounds: Bounds) => Promise<void>;
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
  rawProperties: [],
  rawClusters: [],
  totalCount: 0,
  properties: [],
  clusters: [],
  clusterAnalysisData: new Map(),
  isLoading: false,
  error: null,
  clusterPropertiesCache: new Map(),
  cacheVersion: 0,
};

// Request management (outside store to avoid serialization issues)
let abortController: AbortController | null = null;
let requestId = 0;

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
        if (abortController) {
          abortController.abort();
        }
        requestId++;
        set(
          {
            rawProperties: [],
            rawClusters: [],
            properties: [],
            clusters: [],
            totalCount: 0,
            error: null,
            isLoading: false,
            clusterPropertiesCache: new Map(),
            clusterAnalysisData: new Map(),
            cacheVersion: get().cacheVersion + 1,
          },
          false,
          'clearProperties'
        );
      },
      
      // Fetch properties from API
      fetchProperties: async (bounds: Bounds) => {
        // Cancel any pending request
        if (abortController) {
          abortController.abort();
        }
        
        // Create new abort controller and increment request ID
        abortController = new AbortController();
        const currentRequestId = ++requestId;
        
        const { filters } = get();
        
        set({ isLoading: true, error: null }, false, 'fetchProperties/start');
        
        try {
          const response = await fetch('/api/properties', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bounds, filters }),
            signal: abortController.signal,
          });
          
          // Check if this request is still the latest one
          if (currentRequestId !== requestId) {
            return;
          }
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error: ${response.status}`);
          }
          
          const data: PropertyResponse = await response.json();
          
          // Double-check this is still the latest request
          if (currentRequestId === requestId) {
            set(
              {
                rawProperties: data.properties,
                rawClusters: data.clusters || [],
                totalCount: data.totalCount,
                isLoading: false,
                clusterPropertiesCache: new Map(),
                cacheVersion: get().cacheVersion + 1,
              },
              false,
              'fetchProperties/success'
            );
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          if (currentRequestId === requestId) {
            set(
              {
                error: err instanceof Error ? err.message : 'Failed to fetch properties',
                isLoading: false,
              },
              false,
              'fetchProperties/error'
            );
            console.error('Properties fetch error:', err);
          }
        }
      },
    })),
    { name: 'real-estate-store' }
  )
);

/**
 * Selector hooks for common use cases
 */
export const useRealEstateEnabled = () => useRealEstateStore((s) => s.enabled);
export const useRealEstateFilters = () => useRealEstateStore((s) => s.filters);
export const useRealEstateProperties = () => useRealEstateStore((s) => s.properties);
export const useRealEstateClusters = () => useRealEstateStore((s) => s.clusters);
export const useRealEstateLoading = () => useRealEstateStore((s) => s.isLoading);
export const useRealEstateError = () => useRealEstateStore((s) => s.error);
