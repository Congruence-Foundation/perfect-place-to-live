'use client';

/**
 * useTileQueries - React Query-based property fetching hook
 * 
 * Supports two fetching modes based on zoom level:
 * 
 * 1. Viewport Mode (zoom 10-13):
 *    - Fetches properties directly using viewport bounds
 *    - Single API call, no tiling
 *    - Better for lower zoom levels where clustering is common
 * 
 * 2. Tile Mode (zoom 14+):
 *    - Fetches property data using fixed zoom level tiles
 *    - Batched fetching to respect Otodom API limits
 *    - Automatic deduplication of properties across tiles
 *    - Viewport tile prioritization
 *    - Configurable radius for price analysis
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Bounds } from '@/types';
import type { OtodomProperty, PropertyCluster, PropertyFilters } from '../types';
import {
  getExpandedTilesForRadius,
  hashFilters,
  type TileCoord,
  PROPERTY_TILE_ZOOM,
} from '@/lib/geo/tiles';
import { getTilesForBounds } from '@/lib/geo';
import { PROPERTY_TILE_CONFIG } from '@/constants/performance';
import { createTimer } from '@/lib/profiling';

/**
 * Response from the tile API
 */
interface TileResponse {
  properties: OtodomProperty[];
  clusters: PropertyCluster[];
  totalCount: number;
  cached: boolean;
  fetchedAt?: string;
}

/**
 * Response from the viewport API (same structure)
 */
interface ViewportResponse {
  properties: OtodomProperty[];
  clusters: PropertyCluster[];
  totalCount: number;
  cached: boolean;
}

/**
 * Options for the useTileQueries hook
 */
export interface UseTileQueriesOptions {
  bounds: Bounds | null;
  zoom: number;
  filters: PropertyFilters;
  priceAnalysisRadius: number;
  enabled: boolean;
}

/**
 * Return type for the useTileQueries hook
 */
export interface UseTileQueriesResult {
  properties: OtodomProperty[];
  clusters: PropertyCluster[];
  isLoading: boolean;
  isTooLarge: boolean;
  error: string | null;
  tileCount: number;
  viewportTileCount: number;
  loadedTileCount: number;
  tiles: TileCoord[];
  /** Current fetching mode: 'viewport' for zoom 10-13, 'tile' for zoom 14+ */
  mode: 'viewport' | 'tile';
  /** Total count of properties (standalone + clustered) */
  totalCount: number;
}

/**
 * Fetch properties for a single tile
 */
async function fetchTileProperties(
  tile: TileCoord,
  filters: PropertyFilters,
  signal?: AbortSignal
): Promise<TileResponse> {
  const stopTimer = createTimer('realestate:tile-fetch');
  const response = await fetch('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tile: { z: tile.z, x: tile.x, y: tile.y },
      filters,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error: ${response.status}`);
  }

  const data = await response.json();
  stopTimer({ tile: `${tile.z}:${tile.x}:${tile.y}`, properties: data.properties?.length || 0, clusters: data.clusters?.length || 0 });
  return data;
}

/**
 * Fetch properties for viewport bounds (no tiling)
 */
async function fetchViewportProperties(
  bounds: Bounds,
  filters: PropertyFilters,
  signal?: AbortSignal
): Promise<ViewportResponse> {
  const stopTimer = createTimer('realestate:viewport-fetch');
  const response = await fetch('/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bounds, filters }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error: ${response.status}`);
  }

  const data = await response.json();
  stopTimer({ properties: data.properties?.length || 0, clusters: data.clusters?.length || 0 });
  return data;
}

/**
 * Delay helper for batched fetching
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Hook for fetching property tiles with batching and caching
 * 
 * Supports two modes based on zoom level:
 * - Below MIN_DISPLAY_ZOOM: No properties shown
 * - Viewport mode (zoom MIN_DISPLAY_ZOOM to TILE_MODE_ZOOM-1): Single fetch with bounds
 * - Tile mode (zoom >= TILE_MODE_ZOOM): Batched tile fetching
 */
export function useTileQueries(options: UseTileQueriesOptions): UseTileQueriesResult {
  const { bounds, zoom, filters, priceAnalysisRadius, enabled } = options;
  const queryClient = useQueryClient();

  // Check if zoom is below minimum display level
  const isBelowMinZoom = zoom < PROPERTY_TILE_CONFIG.MIN_DISPLAY_ZOOM;

  // Determine fetching mode based on zoom level
  const mode = zoom >= PROPERTY_TILE_CONFIG.TILE_MODE_ZOOM ? 'tile' : 'viewport';

  // State
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadedTileCount, setLoadedTileCount] = useState(0);
  
  // Viewport mode state
  const [viewportProperties, setViewportProperties] = useState<OtodomProperty[]>([]);
  const [viewportClusters, setViewportClusters] = useState<PropertyCluster[]>([]);
  const [viewportTotalCount, setViewportTotalCount] = useState(0);

  // Refs for tracking fetch state
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  // Calculate tiles needed (only for tile mode, fixed zoom 13)
  const { viewportTiles, allTiles, isTooLarge } = useMemo(() => {
    // Below min zoom or in viewport mode, we don't use tiles
    if (isBelowMinZoom || mode === 'viewport' || !bounds) {
      return { viewportTiles: [], allTiles: [], isTooLarge: false };
    }

    const tileZoom = PROPERTY_TILE_ZOOM;
    const viewport = getTilesForBounds(bounds, tileZoom);

    if (viewport.length > PROPERTY_TILE_CONFIG.MAX_VIEWPORT_TILES) {
      return { viewportTiles: [], allTiles: [], isTooLarge: true };
    }

    let expanded = getExpandedTilesForRadius(viewport, priceAnalysisRadius);

    // Reduce radius if too many tiles
    if (expanded.length > PROPERTY_TILE_CONFIG.MAX_TOTAL_TILES) {
      let reducedRadius = priceAnalysisRadius;
      while (expanded.length > PROPERTY_TILE_CONFIG.MAX_TOTAL_TILES && reducedRadius > 0) {
        reducedRadius--;
        expanded = getExpandedTilesForRadius(viewport, reducedRadius);
      }
    }

    return { viewportTiles: viewport, allTiles: expanded, isTooLarge: false };
  }, [bounds, priceAnalysisRadius, mode, isBelowMinZoom]);

  // Generate filter hash for cache keys
  const filterHash = useMemo(() => hashFilters(filters), [filters]);

  // ============================================
  // VIEWPORT MODE: Single fetch with bounds
  // ============================================
  useEffect(() => {
    // Don't fetch if below minimum zoom, not in viewport mode, disabled, or no bounds
    if (isBelowMinZoom || mode !== 'viewport' || !enabled || !bounds) {
      if (mode !== 'viewport' || isBelowMinZoom) {
        // Clear viewport state when switching to tile mode or below min zoom
        setViewportProperties([]);
        setViewportClusters([]);
        setViewportTotalCount(0);
      }
      return;
    }

    // Cancel any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentFetchId = ++fetchIdRef.current;

    const fetchViewport = async () => {
      setLoadingState('loading');
      setError(null);

      try {
        const stopTimer = createTimer('realestate:viewport-mode-fetch');
        const result = await fetchViewportProperties(bounds, filters, controller.signal);
        
        if (currentFetchId === fetchIdRef.current) {
          setViewportProperties(result.properties);
          setViewportClusters(result.clusters);
          // Calculate total: standalone properties + sum of cluster counts
          const clusterTotal = result.clusters.reduce((sum, c) => sum + c.count, 0);
          setViewportTotalCount(result.properties.length + clusterTotal);
          setLoadingState('done');
          stopTimer({ properties: result.properties.length, clusters: result.clusters.length });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch properties');
          setLoadingState('done');
        }
      }
    };

    fetchViewport();

    return () => {
      controller.abort();
    };
  }, [mode, bounds, filters, enabled, filterHash, isBelowMinZoom]);

  // ============================================
  // TILE MODE: Batched fetching effect
  // ============================================
  useEffect(() => {
    if (mode !== 'tile' || !enabled || isTooLarge || allTiles.length === 0) {
      if (mode === 'tile') {
        setLoadingState('idle');
        setLoadedTileCount(0);
      }
      return;
    }

    // Cancel any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentFetchId = ++fetchIdRef.current;

    const fetchTilesInBatches = async () => {
      setLoadingState('loading');
      setError(null);
      setLoadedTileCount(0);

      const BATCH_SIZE = PROPERTY_TILE_CONFIG.BATCH_SIZE;
      const BATCH_DELAY = PROPERTY_TILE_CONFIG.BATCH_DELAY_MS;

      // Prioritize viewport tiles first
      const viewportSet = new Set(viewportTiles.map((t: TileCoord) => `${t.z}:${t.x}:${t.y}`));
      const sortedTiles = [
        ...viewportTiles,
        ...allTiles.filter((t: TileCoord) => !viewportSet.has(`${t.z}:${t.x}:${t.y}`)),
      ];

      let loaded = 0;
      const stopTotalTimer = createTimer('realestate:batch-fetch-total');

      try {
        for (let i = 0; i < sortedTiles.length; i += BATCH_SIZE) {
          // Check if this fetch was cancelled
          if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) {
            return;
          }

          const batch = sortedTiles.slice(i, i + BATCH_SIZE);
          const stopBatchTimer = createTimer('realestate:batch-fetch');

          // Fetch batch in parallel
          const results = await Promise.allSettled(
            batch.map(tile =>
              queryClient.fetchQuery({
                queryKey: ['property-tile', tile.z, tile.x, tile.y, filterHash],
                queryFn: () => fetchTileProperties(tile, filters, controller.signal),
                staleTime: PROPERTY_TILE_CONFIG.CLIENT_STALE_TIME_MS,
              })
            )
          );

          // Count successful fetches
          const successCount = results.filter(r => r.status === 'fulfilled').length;
          loaded += successCount;
          stopBatchTimer({ batchIndex: Math.floor(i / BATCH_SIZE), tilesInBatch: batch.length, successful: successCount });
          
          if (currentFetchId === fetchIdRef.current) {
            setLoadedTileCount(loaded);
          }

          // Delay between batches (except for last batch)
          if (i + BATCH_SIZE < sortedTiles.length && !controller.signal.aborted) {
            await delay(BATCH_DELAY);
          }
        }

        if (currentFetchId === fetchIdRef.current) {
          setLoadingState('done');
          stopTotalTimer({ totalTiles: sortedTiles.length, loaded });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch tiles');
          setLoadingState('done');
        }
      }
    };

    fetchTilesInBatches();

    return () => {
      controller.abort();
    };
  }, [mode, allTiles, viewportTiles, filterHash, filters, enabled, isTooLarge, queryClient]);

  // Collect results from cache (tile mode only)
  const { tileProperties, tileClusters, tileIsLoading, tileTotalCount } = useMemo(() => {
    if (mode !== 'tile' || isTooLarge || allTiles.length === 0) {
      return { tileProperties: [], tileClusters: [], tileIsLoading: false, tileTotalCount: 0 };
    }

    const stopCollectTimer = createTimer('realestate:collect-results');
    const allProperties: OtodomProperty[] = [];
    const allClusters: PropertyCluster[] = [];
    const seenPropertyIds = new Set<number>();
    const seenClusterKeys = new Set<string>();
    let pendingCount = 0;

    for (const tile of allTiles) {
      const data = queryClient.getQueryData<TileResponse>([
        'property-tile',
        tile.z,
        tile.x,
        tile.y,
        filterHash,
      ]);

      if (!data) {
        pendingCount++;
        continue;
      }

      // Deduplicate properties by ID
      for (const prop of data.properties) {
        if (!seenPropertyIds.has(prop.id)) {
          seenPropertyIds.add(prop.id);
          allProperties.push(prop);
        }
      }

      // Deduplicate clusters by location
      for (const cluster of data.clusters) {
        const clusterKey = `${cluster.lat.toFixed(6)}:${cluster.lng.toFixed(6)}`;
        if (!seenClusterKeys.has(clusterKey)) {
          seenClusterKeys.add(clusterKey);
          allClusters.push(cluster);
        }
      }
    }

    // Calculate total: standalone properties + sum of cluster counts
    const clusterTotal = allClusters.reduce((sum, c) => sum + c.count, 0);
    const totalCount = allProperties.length + clusterTotal;

    stopCollectTimer({ tiles: allTiles.length, pending: pendingCount, properties: allProperties.length, clusters: allClusters.length });

    return {
      tileProperties: allProperties,
      tileClusters: allClusters,
      tileIsLoading: loadingState === 'loading' || pendingCount > 0,
      tileTotalCount: totalCount,
    };
  }, [mode, allTiles, filterHash, loadingState, queryClient, isTooLarge]);

  // Return appropriate results based on mode
  const properties = mode === 'viewport' ? viewportProperties : tileProperties;
  const clusters = mode === 'viewport' ? viewportClusters : tileClusters;
  const isLoading = mode === 'viewport' ? loadingState === 'loading' : tileIsLoading;
  const totalCount = mode === 'viewport' ? viewportTotalCount : tileTotalCount;

  return {
    properties,
    clusters,
    isLoading,
    isTooLarge,
    error,
    tileCount: allTiles.length,
    viewportTileCount: viewportTiles.length,
    loadedTileCount,
    tiles: allTiles,
    mode,
    totalCount,
  };
}
