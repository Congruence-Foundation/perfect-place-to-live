'use client';

/**
 * useTileQueries - React Query-based tile fetching hook
 * 
 * Fetches property data using fixed zoom level tiles with:
 * - Batched fetching to respect Otodom API limits
 * - Automatic deduplication of properties across tiles
 * - Viewport tile prioritization
 * - Configurable radius for price analysis
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
import { createTimer, logPerf } from '@/lib/profiling';

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
 * Delay helper for batched fetching
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Hook for fetching property tiles with batching and caching
 */
export function useTileQueries(options: UseTileQueriesOptions): UseTileQueriesResult {
  const { bounds, filters, priceAnalysisRadius, enabled } = options;
  const queryClient = useQueryClient();

  // State
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadedTileCount, setLoadedTileCount] = useState(0);

  // Refs for tracking fetch state
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);

  // Calculate tiles needed (fixed zoom 13)
  const { viewportTiles, allTiles, isTooLarge } = useMemo(() => {
    if (!bounds) {
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
  }, [bounds, priceAnalysisRadius]);

  // Generate filter hash for cache keys
  const filterHash = useMemo(() => hashFilters(filters), [filters]);

  // Batched fetching effect
  useEffect(() => {
    if (!enabled || isTooLarge || allTiles.length === 0) {
      setLoadingState('idle');
      setLoadedTileCount(0);
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
  }, [allTiles, viewportTiles, filterHash, filters, enabled, isTooLarge, queryClient]);

  // Collect results from cache
  const { properties, clusters, isLoading } = useMemo(() => {
    if (isTooLarge || allTiles.length === 0) {
      return { properties: [], clusters: [], isLoading: false };
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

    stopCollectTimer({ tiles: allTiles.length, pending: pendingCount, properties: allProperties.length, clusters: allClusters.length });

    return {
      properties: allProperties,
      clusters: allClusters,
      isLoading: loadingState === 'loading' || pendingCount > 0,
    };
  }, [allTiles, filterHash, loadingState, queryClient, isTooLarge]);

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
  };
}
