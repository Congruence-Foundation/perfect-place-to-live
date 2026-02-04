'use client';

/**
 * useHeatmapTiles - React Query-based heatmap tile fetching hook
 * 
 * Fetches heatmap data using the batch endpoint with:
 * - Tile-aligned POI caching for efficient cache reuse
 * - Single batch request for all tiles
 * - Automatic deduplication of heatmap points across tiles
 * - Configurable POI buffer scale for accuracy vs performance
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decode } from '@msgpack/msgpack';
import type { Bounds, Factor, HeatmapPoint, POI, DistanceCurve, POIDataSource } from '@/types';
import {
  getExpandedTilesForRadius,
  hashHeatmapConfig,
  type TileCoord,
  HEATMAP_TILE_ZOOM,
} from '@/lib/geo/tiles';
import { getTilesForBounds, tileToBounds, createCoordinateKey } from '@/lib/geo';
import { HEATMAP_TILE_CONFIG, FETCH_CONFIG } from '@/constants/performance';
import { createTimer } from '@/lib/profiling';
import { useMapStore } from '@/stores/mapStore';

/**
 * Response from the batch heatmap API
 */
interface BatchHeatmapResponse {
  tiles: Record<string, {
    points: HeatmapPoint[];
    cached: boolean;
  }>;
  pois: Record<string, POI[]>;
  metadata: {
    totalTiles: number;
    cachedTiles: number;
    computedTiles: number;
    totalPoints: number;
    computeTimeMs: number;
    poiTileCount: number;
    poiCounts: Record<string, number>;
    dataSource: POIDataSource;
    l1CacheStats?: {
      heatmap: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
      poi: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
    };
  };
}

/**
 * Generate a stable cache key from tiles array
 */
function getTilesKey(tiles: TileCoord[]): string {
  return tiles.map(t => `${t.z}:${t.x}:${t.y}`).sort().join(',');
}

/**
 * Options for the useHeatmapTiles hook
 */
export interface UseHeatmapTilesOptions {
  bounds: Bounds | null;
  factors: Factor[];
  distanceCurve: DistanceCurve;
  sensitivity: number;
  normalizeToViewport: boolean;
  dataSource: POIDataSource;
  tileRadius: number;
  poiBufferScale: number;
  enabled: boolean;
}

/**
 * Return type for the useHeatmapTiles hook
 */
export interface UseHeatmapTilesResult {
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  isLoading: boolean;
  isTooLarge: boolean;
  error: string | null;
  metadata: {
    gridSize: number | string;
    pointCount: number;
    computeTimeMs: number;
    factorCount: number;
    dataSource?: POIDataSource;
    poiCounts: Record<string, number>;
    poiTileCount?: number;
    cachedTiles?: number;
    l1CacheStats?: {
      heatmap: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
      poi: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
    };
  } | null;
  tileCount: number;
  viewportTileCount: number;
  loadedTileCount: number;
  usedFallback: boolean;
  clearFallbackNotification: () => void;
  abort: () => void;
  refresh: () => void;
  /** Current tiles (synchronous with heatmapPoints for canvas bounds) */
  tiles: TileCoord[];
  /** True when heatmapPoints are ready for current tiles (prevents stale renders) */
  isDataReady: boolean;
}

/**
 * Fetch heatmap data for multiple tiles using batch endpoint
 */
async function fetchHeatmapBatch(
  tiles: TileCoord[],
  factors: Factor[],
  distanceCurve: DistanceCurve,
  sensitivity: number,
  normalizeToViewport: boolean,
  dataSource: POIDataSource,
  poiBufferScale: number,
  viewportBounds: Bounds,
  signal?: AbortSignal
): Promise<BatchHeatmapResponse> {
  // Create a timeout signal that aborts after configured timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), FETCH_CONFIG.HEATMAP_FETCH_TIMEOUT_MS);
  
  // Combine the external signal with the timeout signal
  const combinedSignal = signal 
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;
  
  const stopFetchTimer = createTimer('heatmap:client:fetch');
  
  try {
    const response = await fetch('/api/heatmap/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/msgpack',
      },
      body: JSON.stringify({
        tiles: tiles.map(t => ({ z: t.z, x: t.x, y: t.y })),
        factors,
        distanceCurve,
        sensitivity,
        normalizeToViewport,
        dataSource,
        poiBufferScale,
        viewportBounds,
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error: ${response.status}`);
    }

    // Check if response is MessagePack or JSON
    const contentType = response.headers.get('Content-Type');
    
    const stopParseTimer = createTimer('heatmap:client:parse');
    let result: BatchHeatmapResponse;
    let responseSize: number | undefined;
    
    if (contentType === 'application/msgpack') {
      const buffer = await response.arrayBuffer();
      responseSize = buffer.byteLength;
      result = decode(new Uint8Array(buffer)) as BatchHeatmapResponse;
    } else {
      result = await response.json();
    }
    
    stopParseTimer({ format: contentType === 'application/msgpack' ? 'msgpack' : 'json', bytes: responseSize });
    stopFetchTimer({ tiles: tiles.length, factors: factors.filter(f => f.enabled).length });
    
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Hook for fetching heatmap tiles using batch endpoint
 */
export function useHeatmapTiles(options: UseHeatmapTilesOptions): UseHeatmapTilesResult {
  const {
    bounds,
    factors,
    distanceCurve,
    sensitivity,
    normalizeToViewport,
    dataSource,
    tileRadius,
    poiBufferScale,
    enabled,
  } = options;
  
  const setHeatmapDebugTiles = useMapStore((s) => s.setHeatmapDebugTiles);

  // State
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchHeatmapResponse | null>(null);

  // Refs for tracking fetch state
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  
  // Ref to track which tiles the current batchResult corresponds to
  // This prevents rendering stale data when tiles change but batchResult hasn't updated yet
  const batchResultTilesRef = useRef<string>('');
  
  // Ref to preserve last valid POIs when zoomed out
  const lastValidPoisRef = useRef<Record<string, POI[]>>({});
  
  // Ref to accumulate heatmap points across pans
  const accumulatedPointsRef = useRef<Map<string, HeatmapPoint>>(new Map());

  // Calculate tiles needed (fixed zoom 13)
  const { viewportTiles, allTiles, isTooLarge } = useMemo(() => {
    if (!bounds) {
      return { viewportTiles: [], allTiles: [], isTooLarge: false };
    }

    const viewport = getTilesForBounds(bounds, HEATMAP_TILE_ZOOM);

    if (viewport.length > HEATMAP_TILE_CONFIG.MAX_VIEWPORT_TILES) {
      return { viewportTiles: [], allTiles: [], isTooLarge: true };
    }

    let expanded = getExpandedTilesForRadius(viewport, tileRadius);

    // Reduce radius if too many tiles
    if (expanded.length > HEATMAP_TILE_CONFIG.MAX_TOTAL_TILES) {
      let reducedRadius = tileRadius;
      while (expanded.length > HEATMAP_TILE_CONFIG.MAX_TOTAL_TILES && reducedRadius > 0) {
        reducedRadius--;
        expanded = getExpandedTilesForRadius(viewport, reducedRadius);
      }
    }

    return { viewportTiles: viewport, allTiles: expanded, isTooLarge: false };
  }, [bounds, tileRadius]);

  // Sync heatmap tiles to store for debug rendering
  useEffect(() => {
    setHeatmapDebugTiles(allTiles);
  }, [allTiles, setHeatmapDebugTiles]);

  // Generate config hash for cache keys
  const configHash = useMemo(() => hashHeatmapConfig({
    factors,
    distanceCurve,
    sensitivity,
  }), [factors, distanceCurve, sensitivity]);

  // Clear accumulated data when config changes (scores would be different)
  const prevConfigHashRef = useRef(configHash);
  useEffect(() => {
    if (prevConfigHashRef.current !== configHash) {
      accumulatedPointsRef.current.clear();
      lastValidPoisRef.current = {};
      setBatchResult(null); // Clear old results to avoid showing stale scores
      prevConfigHashRef.current = configHash;
    }
  }, [configHash]);

  // Clear fallback notification
  const clearFallbackNotification = useCallback(() => {
    setUsedFallback(false);
  }, []);

  // Abort current fetch
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoadingState('idle');
  }, []);

  // Force refresh by clearing cache and refetching
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = useCallback(() => {
    // Clear accumulated data
    accumulatedPointsRef.current.clear();
    lastValidPoisRef.current = {};
    setBatchResult(null);
    // Trigger refetch by incrementing counter
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Batch fetching effect
  useEffect(() => {
    // Check if any factors are enabled
    const enabledFactors = factors.filter(f => f.enabled && f.weight !== 0);
    
    if (!enabled || isTooLarge || allTiles.length === 0 || enabledFactors.length === 0 || !bounds) {
      setLoadingState('idle');
      setBatchResult(null);
      return;
    }

    // Cancel any pending fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentFetchId = ++fetchIdRef.current;

    const fetchBatch = async () => {
      setLoadingState('loading');
      setError(null);
      setUsedFallback(false);

      try {
        const result = await fetchHeatmapBatch(
          allTiles,
          factors,
          distanceCurve,
          sensitivity,
          normalizeToViewport,
          dataSource,
          poiBufferScale,
          bounds,
          controller.signal
        );

        if (controller.signal.aborted || currentFetchId !== fetchIdRef.current) {
          return;
        }

        // Check if fallback occurred
        if (dataSource === 'neon' && result.metadata.dataSource === 'overpass') {
          setUsedFallback(true);
        }

        // Track which tiles this batch result corresponds to
        const tilesKey = getTilesKey(allTiles);
        batchResultTilesRef.current = tilesKey;
        
        setBatchResult(result);
        setLoadingState('done');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was aborted, don't update state - a new request will be started
          return;
        }
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch heatmap');
          setLoadingState('done');
        }
      }
    };

    fetchBatch();

    return () => {
      controller.abort();
      // Reset loading state when effect cleanup runs (e.g., when dependencies change)
      // The new effect will set it to 'loading' if needed
    };
  }, [
    allTiles,
    bounds,
    configHash,
    factors,
    distanceCurve,
    sensitivity,
    normalizeToViewport,
    dataSource,
    poiBufferScale,
    enabled,
    isTooLarge,
    refreshTrigger,
  ]);

  // Process batch result into heatmap points
  const { heatmapPoints, pois, metadata } = useMemo(() => {
    // Check if batchResult corresponds to current tiles
    // This prevents rendering stale/pruned data when tiles changed but API hasn't responded yet
    const currentTilesKey = getTilesKey(allTiles);
    const tilesMatch = batchResultTilesRef.current === currentTilesKey;
    
    if (!batchResult || isTooLarge) {
      // When zoomed out, return accumulated heatmap points and preserve last valid POIs
      return { 
        heatmapPoints: Array.from(accumulatedPointsRef.current.values()), 
        pois: { ...lastValidPoisRef.current }, 
        metadata: null 
      };
    }

    // If tiles don't match, return existing accumulated points without pruning
    // This prevents the "rough edges" flash when tiles change but data hasn't arrived
    if (!tilesMatch) {
      return { 
        heatmapPoints: Array.from(accumulatedPointsRef.current.values()), 
        pois: { ...lastValidPoisRef.current }, 
        metadata: null 
      };
    }

    // Add new points to accumulated map (merge with existing)
    for (const tileData of Object.values(batchResult.tiles)) {
      for (const point of tileData.points) {
        const pointKey = createCoordinateKey(point.lat, point.lng);
        // Always update with latest score (in case settings changed)
        accumulatedPointsRef.current.set(pointKey, point);
      }
    }

    // Prune points outside current tile bounds to prevent unbounded growth
    // Calculate combined bounds from all current tiles
    if (allTiles.length > 0) {
      let minLat = Infinity, maxLat = -Infinity;
      let minLng = Infinity, maxLng = -Infinity;
      
      for (const tile of allTiles) {
        const tb = tileToBounds(tile.z, tile.x, tile.y);
        if (tb.south < minLat) minLat = tb.south;
        if (tb.north > maxLat) maxLat = tb.north;
        if (tb.west < minLng) minLng = tb.west;
        if (tb.east > maxLng) maxLng = tb.east;
      }
      
      // Remove points outside combined bounds
      for (const [key, point] of accumulatedPointsRef.current) {
        if (point.lat < minLat || point.lat > maxLat || 
            point.lng < minLng || point.lng > maxLng) {
          accumulatedPointsRef.current.delete(key);
        }
      }
      
      // Also prune POIs outside bounds
      for (const factorId of Object.keys(lastValidPoisRef.current)) {
        lastValidPoisRef.current[factorId] = lastValidPoisRef.current[factorId].filter(
          p => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng
        );
      }
    }

    const enabledFactors = factors.filter(f => f.enabled && f.weight !== 0);
    
    // Merge new POIs with existing ones
    if (Object.keys(batchResult.pois).length > 0) {
      for (const [factorId, factorPois] of Object.entries(batchResult.pois)) {
        const existing = lastValidPoisRef.current[factorId] || [];
        const seenKeys = new Set(existing.map(p => createCoordinateKey(p.lat, p.lng)));
        const newPois = factorPois.filter(p => !seenKeys.has(createCoordinateKey(p.lat, p.lng)));
        lastValidPoisRef.current[factorId] = [...existing, ...newPois];
      }
    }

    // Return a new object to trigger React re-render
    return {
      heatmapPoints: Array.from(accumulatedPointsRef.current.values()),
      pois: { ...lastValidPoisRef.current },
      metadata: {
        gridSize: 'adaptive',
        pointCount: accumulatedPointsRef.current.size,
        computeTimeMs: batchResult.metadata.computeTimeMs,
        factorCount: enabledFactors.length,
        dataSource: batchResult.metadata.dataSource,
        poiCounts: batchResult.metadata.poiCounts,
        poiTileCount: batchResult.metadata.poiTileCount,
        cachedTiles: batchResult.metadata.cachedTiles,
        l1CacheStats: batchResult.metadata.l1CacheStats,
      },
    };
  }, [batchResult, isTooLarge, factors, allTiles]);

  // Memoize tiles key calculation to avoid recomputing on every render
  const currentTilesKey = useMemo(
    () => getTilesKey(allTiles),
    [allTiles]
  );

  // Check if current data matches current tiles (for preventing stale renders)
  // Data is ready when:
  // 1. We have a batchResult AND it matches current tiles, OR
  // 2. There are no tiles to load (allTiles.length === 0)
  const isDataReady = useMemo(
    () => (batchResult && batchResultTilesRef.current === currentTilesKey) || allTiles.length === 0,
    [batchResult, currentTilesKey, allTiles.length]
  );

  return {
    heatmapPoints,
    pois,
    // Show loading state whenever we're actively fetching new tiles
    isLoading: loadingState === 'loading',
    isTooLarge,
    error,
    metadata,
    tileCount: allTiles.length,
    viewportTileCount: viewportTiles.length,
    loadedTileCount: batchResult ? Object.keys(batchResult.tiles).length : 0,
    usedFallback,
    clearFallbackNotification,
    abort,
    refresh,
    // Expose tiles for canvas bounds calculation (synchronous with points)
    tiles: allTiles,
    // Flag indicating if heatmapPoints are ready for current tiles (prevents stale renders)
    isDataReady,
  };
}
