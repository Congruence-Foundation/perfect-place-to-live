'use client';

/**
 * useHeatmapTiles - Heatmap tile fetching hook
 * 
 * Fetches heatmap data using the batch endpoint with:
 * - Tile-aligned POI caching for efficient cache reuse
 * - Single batch request for all tiles
 * - Automatic deduplication of heatmap points across tiles
 * - Configurable POI buffer scale for accuracy vs performance
 * 
 * Note: This hook uses refs during render for performance optimization.
 * Reading refs during render is valid in React - refs are synchronous
 * and can be read at any time. The refs are used to maintain accumulated
 * state across renders without triggering re-renders.
 */

/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { decode } from '@msgpack/msgpack';

import type { Bounds, Factor, HeatmapPoint, POI, DistanceCurve, POIDataSource } from '@/types';
import { HEATMAP_TILE_CONFIG, FETCH_CONFIG } from '@/constants/performance';
import {
  hashHeatmapConfig,
  calculateTilesWithRadius,
  type TileCoord,
  HEATMAP_TILE_ZOOM,
} from '@/lib/geo/tiles';
import { tileToBounds, createCoordinateKey } from '@/lib/geo';
import { createTimer } from '@/lib/profiling';
import { useMapStore } from '@/stores/mapStore';

// ============================================================================
// Types
// ============================================================================

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
 * Combined bounds from multiple tiles
 */
interface CombinedBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a stable cache key from tiles array
 */
function getTilesKey(tiles: TileCoord[]): string {
  return tiles.map(t => `${t.z}:${t.x}:${t.y}`).sort().join(',');
}

/**
 * Calculate combined bounds from an array of tiles
 */
function calculateCombinedBounds(tiles: TileCoord[]): CombinedBounds | null {
  if (tiles.length === 0) return null;
  
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  for (const tile of tiles) {
    const tb = tileToBounds(tile.z, tile.x, tile.y);
    if (tb.south < minLat) minLat = tb.south;
    if (tb.north > maxLat) maxLat = tb.north;
    if (tb.west < minLng) minLng = tb.west;
    if (tb.east > maxLng) maxLng = tb.east;
  }
  
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Check if a point is within the given bounds
 */
function isPointInBounds(point: { lat: number; lng: number }, bounds: CombinedBounds): boolean {
  return point.lat >= bounds.minLat && 
         point.lat <= bounds.maxLat && 
         point.lng >= bounds.minLng && 
         point.lng <= bounds.maxLng;
}

/**
 * Prune heatmap points outside the given bounds
 */
function prunePointsOutsideBounds(
  pointsMap: Map<string, HeatmapPoint>,
  bounds: CombinedBounds
): void {
  for (const [key, point] of pointsMap) {
    if (!isPointInBounds(point, bounds)) {
      pointsMap.delete(key);
    }
  }
}

/**
 * Prune POIs outside the given bounds
 */
function prunePoisOutsideBounds(
  poisByFactor: Record<string, POI[]>,
  bounds: CombinedBounds
): void {
  for (const factorId of Object.keys(poisByFactor)) {
    poisByFactor[factorId] = poisByFactor[factorId].filter(
      p => isPointInBounds(p, bounds)
    );
  }
}

/**
 * Merge new POIs with existing ones, deduplicating by coordinates
 */
function mergePois(
  existing: Record<string, POI[]>,
  newPois: Record<string, POI[]>
): void {
  for (const [factorId, factorPois] of Object.entries(newPois)) {
    const existingPois = existing[factorId] || [];
    const seenKeys = new Set(existingPois.map(p => createCoordinateKey(p.lat, p.lng)));
    const uniqueNewPois = factorPois.filter(
      p => !seenKeys.has(createCoordinateKey(p.lat, p.lng))
    );
    existing[factorId] = [...existingPois, ...uniqueNewPois];
  }
}

/**
 * Calculate tile overlap ratio between two sets of tiles
 * Returns a value between 0 (no overlap) and 1 (complete overlap)
 */
function calculateTileOverlapRatio(
  currentTiles: Set<string>,
  previousTiles: Set<string>
): number {
  if (previousTiles.size === 0 || currentTiles.size === 0) return 0;
  
  let overlap = 0;
  for (const tile of currentTiles) {
    if (previousTiles.has(tile)) overlap++;
  }
  
  return overlap / Math.max(previousTiles.size, currentTiles.size);
}

// ============================================================================
// Hook Options and Result Types
// ============================================================================

/**
 * Options for the useHeatmapTiles hook
 */
interface UseHeatmapTilesOptions {
  bounds: Bounds | null;
  factors: Factor[];
  distanceCurve: DistanceCurve;
  sensitivity: number;
  lambda: number;
  normalizeToViewport: boolean;
  dataSource: POIDataSource;
  tileRadius: number;
  poiBufferScale: number;
  enabled: boolean;
}

/**
 * Metadata returned from heatmap processing
 */
interface HeatmapMetadata {
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
}

/**
 * Return type for the useHeatmapTiles hook
 */
interface UseHeatmapTilesResult {
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  isLoading: boolean;
  isTooLarge: boolean;
  error: string | null;
  metadata: HeatmapMetadata | null;
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

// ============================================================================
// API Fetch Function
// ============================================================================

/**
 * Fetch heatmap data for multiple tiles using batch endpoint
 */
async function fetchHeatmapBatch(
  tiles: TileCoord[],
  factors: Factor[],
  distanceCurve: DistanceCurve,
  sensitivity: number,
  lambda: number,
  normalizeToViewport: boolean,
  dataSource: POIDataSource,
  poiBufferScale: number,
  viewportBounds: Bounds,
  signal?: AbortSignal
): Promise<BatchHeatmapResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(), 
    FETCH_CONFIG.HEATMAP_FETCH_TIMEOUT_MS
  );
  
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
        lambda,
        normalizeToViewport,
        dataSource,
        poiBufferScale,
        viewportBounds,
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => ({}));
      const message = errorData && typeof errorData === 'object' && 'message' in errorData && typeof errorData.message === 'string'
        ? errorData.message
        : `HTTP error: ${response.status}`;
      throw new Error(message);
    }

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
    
    const enabledFactorCount = factors.filter(f => f.enabled).length;
    stopParseTimer({ format: contentType === 'application/msgpack' ? 'msgpack' : 'json', bytes: responseSize });
    stopFetchTimer({ tiles: tiles.length, factors: enabledFactorCount });
    
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Hook for fetching heatmap tiles using batch endpoint
 * 
 * @param options - Configuration options for heatmap tile fetching
 * @returns Object containing heatmap data, loading state, and control functions
 */
export function useHeatmapTiles(options: UseHeatmapTilesOptions): UseHeatmapTilesResult {
  const {
    bounds,
    factors,
    distanceCurve,
    sensitivity,
    lambda,
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
    return calculateTilesWithRadius({
      bounds,
      tileZoom: HEATMAP_TILE_ZOOM,
      radius: tileRadius,
      maxViewportTiles: HEATMAP_TILE_CONFIG.MAX_VIEWPORT_TILES,
      maxTotalTiles: HEATMAP_TILE_CONFIG.MAX_TOTAL_TILES,
    });
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
    lambda,
  }), [factors, distanceCurve, sensitivity, lambda]);

  // Clear accumulated data when config changes (scores would be different)
  const prevConfigHashRef = useRef(configHash);
  const prevTileSetRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (prevConfigHashRef.current !== configHash) {
      accumulatedPointsRef.current.clear();
      lastValidPoisRef.current = {};
      setBatchResult(null); // Clear old results to avoid showing stale scores
      prevConfigHashRef.current = configHash;
      prevTileSetRef.current.clear();
    }
  }, [configHash]);
  
  // Clear accumulated data when tiles change significantly (zoom change)
  // This prevents the "double overlay" effect when zooming out
  // We detect significant change by checking if less than 50% of tiles overlap
  useEffect(() => {
    const currentTileSet = new Set(allTiles.map(t => `${t.z}:${t.x}:${t.y}`));
    const prevTileSet = prevTileSetRef.current;
    
    const overlapRatio = calculateTileOverlapRatio(currentTileSet, prevTileSet);
    
    // If less than 50% overlap, clear accumulated data (likely a zoom change)
    if (overlapRatio < 0.5 && prevTileSet.size > 0 && currentTileSet.size > 0) {
      accumulatedPointsRef.current.clear();
      lastValidPoisRef.current = {};
    }
    
    prevTileSetRef.current = currentTileSet;
  }, [allTiles]);

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
          lambda,
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
    factors,
    distanceCurve,
    sensitivity,
    lambda,
    normalizeToViewport,
    dataSource,
    poiBufferScale,
    enabled,
    isTooLarge,
    refreshTrigger,
  ]);

  // Memoize tiles key to avoid recomputing in multiple places
  const currentTilesKey = useMemo(() => getTilesKey(allTiles), [allTiles]);

  // Process batch result into heatmap points
  const { heatmapPoints, pois, metadata } = useMemo(() => {
    const tilesMatch = batchResultTilesRef.current === currentTilesKey;
    
    // Early return for zoomed out or tiles mismatch - return accumulated data without modification
    if (!batchResult || isTooLarge || !tilesMatch) {
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
        accumulatedPointsRef.current.set(pointKey, point);
      }
    }

    // Prune points and POIs outside current tile bounds to prevent unbounded growth
    const combinedBounds = calculateCombinedBounds(allTiles);
    if (combinedBounds) {
      prunePointsOutsideBounds(accumulatedPointsRef.current, combinedBounds);
      prunePoisOutsideBounds(lastValidPoisRef.current, combinedBounds);
    }

    // Merge new POIs with existing ones
    if (Object.keys(batchResult.pois).length > 0) {
      mergePois(lastValidPoisRef.current, batchResult.pois);
    }

    const enabledFactorCount = factors.filter(f => f.enabled && f.weight !== 0).length;

    return {
      heatmapPoints: Array.from(accumulatedPointsRef.current.values()),
      pois: { ...lastValidPoisRef.current },
      metadata: {
        gridSize: 'adaptive',
        pointCount: accumulatedPointsRef.current.size,
        computeTimeMs: batchResult.metadata.computeTimeMs,
        factorCount: enabledFactorCount,
        dataSource: batchResult.metadata.dataSource,
        poiCounts: batchResult.metadata.poiCounts,
        poiTileCount: batchResult.metadata.poiTileCount,
        cachedTiles: batchResult.metadata.cachedTiles,
        l1CacheStats: batchResult.metadata.l1CacheStats,
      },
    };
  }, [batchResult, isTooLarge, factors, allTiles, currentTilesKey]);

  // Check if current data matches current tiles (for preventing stale renders)
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
