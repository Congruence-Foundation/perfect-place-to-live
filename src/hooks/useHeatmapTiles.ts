'use client';

/**
 * useHeatmapTiles - Heatmap tile fetching hook
 * 
 * Fetches heatmap data using the batch endpoint with:
 * - Tile-aligned POI caching for efficient cache reuse
 * - Progressive background pre-fetching for smooth panning
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
  calculateTileDelta,
  getTileKeyString,
  type TileCoord,
  HEATMAP_TILE_ZOOM,
} from '@/lib/geo/tiles';
import { tileToBounds, createCoordinateKey } from '@/lib/geo';
import { createTimer } from '@/lib/profiling';
import { useMapStore } from '@/stores/mapStore';

// ============================================================================
// Types
// ============================================================================
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
// Helpers
// ============================================================================
function getTilesKey(tiles: TileCoord[]): string {
  return tiles.map(getTileKeyString).sort().join(',');
}

/** Create a Set of tile key strings for fast lookup */
function toTileKeySet(tiles: TileCoord[]): Set<string> {
  return new Set(tiles.map(getTileKeyString));
}

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

function isPointInBounds(point: { lat: number; lng: number }, bounds: CombinedBounds): boolean {
  return point.lat >= bounds.minLat && 
         point.lat <= bounds.maxLat && 
         point.lng >= bounds.minLng && 
         point.lng <= bounds.maxLng;
}

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

/** Merge new POIs into existing, deduplicating by coordinates */
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

/** Returns 0..1 overlap ratio between two tile key sets */
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
// Hook Types
// ============================================================================
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
  /** Whether to use progressive prefetch (true) or batch mode (false) */
  usePrefetchMode: boolean;
}

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

interface UseHeatmapTilesResult {
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  isLoading: boolean;
  isTooLarge: boolean;
  error: string | null;
  metadata: HeatmapMetadata | null;
  tileCount: number;
  viewportTileCount: number;
  usedFallback: boolean;
  clearFallbackNotification: () => void;
  abort: () => void;
  refresh: () => void;
  tiles: TileCoord[];
  isDataReady: boolean;
  prefetchPhase: number | null;
}

// ============================================================================
// API
// ============================================================================

/** Fetch heatmap data for multiple tiles via the batch endpoint */
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
 * Implements progressive background pre-fetching:
 * - Phase 0: Fetch viewport tiles immediately, render as soon as ready
 * - Phase 1..N: Fetch expanding rings in background for smooth panning
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
    usePrefetchMode,
  } = options;
  
  const setHeatmapDebugTiles = useMapStore((s) => s.setHeatmapDebugTiles);

  // State
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [prefetchPhase, setPrefetchPhase] = useState<number | null>(null);
  
  // State for current rendered tiles (expands as prefetch phases complete)
  const [renderedTiles, setRenderedTiles] = useState<TileCoord[]>([]);

  // Refs for accumulated state across fetches
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const prefetchPhaseRef = useRef<number | null>(null);
  const renderedTilesKeyRef = useRef<string>('');
  const renderedTilesRef = useRef<TileCoord[]>([]);
  const lastValidPoisRef = useRef<Record<string, POI[]>>({});
  const accumulatedPointsRef = useRef<Map<string, HeatmapPoint>>(new Map());
  const lastMetadataRef = useRef<BatchHeatmapResponse['metadata'] | null>(null);
  // Ref to hold latest options for reading inside effect without adding unstable deps
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** Update prefetch phase in both ref (for abort logic) and state (for UI) */
  const updatePhase = (phase: number | null) => {
    prefetchPhaseRef.current = phase;
    setPrefetchPhase(phase);
  };
  
  /** Clear all accumulated data and reset rendered state */
  const clearAccumulated = () => {
    accumulatedPointsRef.current.clear();
    lastValidPoisRef.current = {};
    lastMetadataRef.current = null;
    setRenderedTiles([]);
    renderedTilesRef.current = [];
    renderedTilesKeyRef.current = '';
  };

  // Calculate viewport tiles (tile zoom level from config, radius 0 for viewport only)
  const { viewportTiles, isTooLarge } = useMemo(() => {
    return calculateTilesWithRadius({
      bounds,
      tileZoom: HEATMAP_TILE_ZOOM,
      radius: 0, // Always start with viewport only
      maxViewportTiles: HEATMAP_TILE_CONFIG.MAX_VIEWPORT_TILES,
      maxTotalTiles: HEATMAP_TILE_CONFIG.MAX_TOTAL_TILES,
    });
  }, [bounds]);

  // Stable key for viewport tiles - used to detect actual tile changes
  const viewportTilesKey = useMemo(() => getTilesKey(viewportTiles), [viewportTiles]);
  
  // Ref to track previous viewport tiles key for smart abort logic
  const prevViewportTilesKeyRef = useRef<string>('');
  
  // Ref to track previous fetch trigger key to detect config changes
  const prevFetchTriggerKeyRef = useRef<string>('');

  // Sync heatmap tiles to store for debug rendering (use rendered tiles, not just viewport)
  useEffect(() => {
    setHeatmapDebugTiles(renderedTiles.length > 0 ? renderedTiles : viewportTiles);
  }, [renderedTiles, viewportTiles, setHeatmapDebugTiles]);

  // Generate config hash for cache keys
  const configHash = useMemo(() => hashHeatmapConfig({
    factors,
    distanceCurve,
    sensitivity,
    lambda,
  }), [factors, distanceCurve, sensitivity, lambda]);

  // Stable key that triggers re-fetch when any fetch-relevant option changes
  const fetchTriggerKey = `${configHash}|${normalizeToViewport}|${dataSource}|${poiBufferScale}|${tileRadius}|${usePrefetchMode}|${enabled}|${isTooLarge}`;

  // Clear accumulated data when config changes or viewport tiles shift significantly (zoom)
  const prevConfigHashRef = useRef(configHash);
  const prevViewportTileSetRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const configChanged = prevConfigHashRef.current !== configHash;
    
    if (configChanged) {
      clearAccumulated();
      prevConfigHashRef.current = configHash;
      prevViewportTileSetRef.current.clear();
      return;
    }
    
    // Detect significant viewport tile change (likely a zoom) by overlap ratio
    const currentTileSet = toTileKeySet(viewportTiles);
    const prevTileSet = prevViewportTileSetRef.current;
    const overlapRatio = calculateTileOverlapRatio(currentTileSet, prevTileSet);
    
    if (overlapRatio < 0.5 && prevTileSet.size > 0 && currentTileSet.size > 0) {
      clearAccumulated();
    }
    
    prevViewportTileSetRef.current = currentTileSet;
  }, [configHash, viewportTiles]);

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
    updatePhase(null);
  }, []);

  // Force refresh by clearing cache and refetching
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = useCallback(() => {
    clearAccumulated();
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Progressive phased fetching effect
  useEffect(() => {
    // Check if any factors are enabled
    const { factors, distanceCurve, sensitivity, lambda, normalizeToViewport, 
            dataSource, tileRadius, poiBufferScale, enabled, usePrefetchMode, bounds } = optionsRef.current;
    const enabledFactors = factors.filter(f => f.enabled && f.weight !== 0);
    
    if (!enabled || isTooLarge || viewportTiles.length === 0 || enabledFactors.length === 0 || !bounds) {
      setLoadingState('idle');
      updatePhase(null);
      return;
    }

    // Smart abort logic: only skip re-fetch when nothing meaningful changed
    const viewportTilesChanged = viewportTilesKey !== prevViewportTilesKeyRef.current;
    const configChanged = fetchTriggerKey !== prevFetchTriggerKeyRef.current;
    prevViewportTilesKeyRef.current = viewportTilesKey;
    prevFetchTriggerKeyRef.current = fetchTriggerKey;
    
    // If nothing changed and a fetch is already in progress, let it continue
    if (!viewportTilesChanged && !configChanged && prefetchPhaseRef.current !== null) {
      return;
    }
    
    // Config changed → clear accumulated data (scores are different)
    if (configChanged) {
      clearAccumulated();
    }

    // Cancel any pending fetch (viewport changed or starting fresh)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentFetchId = ++fetchIdRef.current;
    
    // Snapshot viewportTiles for this effect run (stable reference)
    const currentViewportTiles = viewportTiles;
    
    // Build phase list:
    // - Prefetch mode: [0, 1, 2, ...tileRadius] (progressive rings)
    // - Batch mode:    [tileRadius]              (single fetch at full radius)
    const phases = (usePrefetchMode && tileRadius > 0)
      ? Array.from({ length: tileRadius + 1 }, (_, i) => i)
      : [tileRadius];

    const isAborted = () => controller.signal.aborted || currentFetchId !== fetchIdRef.current;

    /** Merge a batch result into accumulated state */
    const mergeResult = (result: BatchHeatmapResponse) => {
      if (dataSource === 'neon' && result.metadata.dataSource === 'overpass') {
        setUsedFallback(true);
      }
      for (const tileData of Object.values(result.tiles)) {
        for (const point of tileData.points) {
          accumulatedPointsRef.current.set(createCoordinateKey(point.lat, point.lng), point);
        }
      }
      if (Object.keys(result.pois).length > 0) {
        mergePois(lastValidPoisRef.current, result.pois);
      }
      lastMetadataRef.current = result.metadata;
    };

    /** Update rendered tiles in both ref and state */
    const commitTiles = (tiles: TileCoord[]) => {
      const copy = [...tiles];
      renderedTilesRef.current = copy;
      renderedTilesKeyRef.current = getTilesKey(tiles);
      setRenderedTiles(copy);
    };

    const fetchData = async () => {
      setError(null);
      setUsedFallback(false);
      
      // Read latest bounds from optionsRef (already destructured above)
      if (!bounds) return;
      
      // Read from ref to get the latest rendered tiles (avoids stale closure capture)
      const currentRendered = renderedTilesRef.current;
      
      // Start from tiles we already have data for -- delta calculations will skip them
      let fetchedTiles: TileCoord[] = [...currentRendered];
      
      // Check if viewport tiles are already covered by pre-fetched data
      const renderedTileKeys = toTileKeySet(currentRendered);
      const viewportCovered = currentViewportTiles.length > 0 && currentViewportTiles.every(
        t => renderedTileKeys.has(getTileKeyString(t))
      );
      
      // Only show loading spinner if viewport tiles need fetching
      if (!viewportCovered) {
        setLoadingState('loading');
      }
      
      try {
        for (let i = 0; i < phases.length; i++) {
          const radius = phases[i];
          if (isAborted()) return;
          
          updatePhase(radius);
          
          const { allTiles: tilesAtRadius } = calculateTilesWithRadius({
            bounds,
            tileZoom: HEATMAP_TILE_ZOOM,
            radius,
            maxViewportTiles: HEATMAP_TILE_CONFIG.MAX_VIEWPORT_TILES,
            maxTotalTiles: HEATMAP_TILE_CONFIG.MAX_TOTAL_TILES,
          });
          
          if (tilesAtRadius.length === 0) break;
          
          // Only fetch tiles we don't already have (from previous phases or previous fetches)
          const tilesToFetch = calculateTileDelta(tilesAtRadius, fetchedTiles);
          
          if (tilesToFetch.length === 0) {
            // Tiles at this radius are already covered -- only expand fetchedTiles, never shrink
            if (tilesAtRadius.length > fetchedTiles.length) {
              fetchedTiles = tilesAtRadius;
              commitTiles(fetchedTiles);
            }
            // Do NOT set fetchedTiles = tilesAtRadius when it's smaller (would lose pre-fetched tiles)
            continue;
          }
          
          // Yield to main thread between background phases
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, HEATMAP_TILE_CONFIG.PREFETCH_DELAY_MS));
            if (isAborted()) return;
          }
          
          const result = await fetchHeatmapBatch(
            tilesToFetch, factors, distanceCurve, sensitivity,
            lambda, normalizeToViewport, dataSource, poiBufferScale,
            bounds, controller.signal
          );
          if (isAborted()) return;
          
          mergeResult(result);
          fetchedTiles = tilesAtRadius;
          commitTiles(fetchedTiles);
          
          // After first phase completes, mark loading as done (background phases don't block UI)
          if (i === 0) setLoadingState('done');
        }
        
        // All phases complete - ensure loading is done even if all deltas were empty
        setLoadingState('done');
        updatePhase(null);
        
        // Prune points and POIs outside final tile bounds to prevent unbounded growth
        const combinedBounds = calculateCombinedBounds(fetchedTiles);
        if (combinedBounds) {
          prunePointsOutsideBounds(accumulatedPointsRef.current, combinedBounds);
          prunePoisOutsideBounds(lastValidPoisRef.current, combinedBounds);
        }
        
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (currentFetchId === fetchIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch heatmap');
          setLoadingState('done');
          updatePhase(null);
        }
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, [
    viewportTilesKey,
    fetchTriggerKey,
    refreshTrigger,
  ]);

  // Memoize tiles key to avoid recomputing in multiple places
  const currentRenderedTilesKey = useMemo(() => getTilesKey(renderedTiles), [renderedTiles]);

  // Build metadata from latest fetch result
  const metadata: HeatmapMetadata | null = useMemo(() => {
    const tilesMatch = renderedTilesKeyRef.current === currentRenderedTilesKey;
    if (isTooLarge || !tilesMatch || renderedTiles.length === 0) return null;

    const lastMeta = lastMetadataRef.current;
    if (!lastMeta) return null;

    return {
      gridSize: 'adaptive',
      pointCount: accumulatedPointsRef.current.size,
      computeTimeMs: lastMeta.computeTimeMs,
      factorCount: factors.filter(f => f.enabled && f.weight !== 0).length,
      dataSource: lastMeta.dataSource,
      poiCounts: lastMeta.poiCounts,
      poiTileCount: lastMeta.poiTileCount,
      cachedTiles: lastMeta.cachedTiles,
      l1CacheStats: lastMeta.l1CacheStats,
    };
  }, [isTooLarge, factors, renderedTiles, currentRenderedTilesKey]);

  // Snapshot accumulated points and POIs (re-derived when renderedTiles change)
  const heatmapPoints = useMemo(
    () => Array.from(accumulatedPointsRef.current.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderedTiles]
  );
  const pois = useMemo(
    () => ({ ...lastValidPoisRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderedTiles]
  );

  // Check if current data matches current tiles (for preventing stale renders)
  const isDataReady = useMemo(
    () => (renderedTiles.length > 0 && renderedTilesKeyRef.current === currentRenderedTilesKey) || viewportTiles.length === 0,
    [renderedTiles.length, currentRenderedTilesKey, viewportTiles.length]
  );

  return {
    heatmapPoints,
    pois,
    isLoading: loadingState === 'loading' && prefetchPhase === 0,
    isTooLarge,
    error,
    metadata,
    tileCount: renderedTiles.length,
    viewportTileCount: viewportTiles.length,
    usedFallback,
    clearFallbackNotification,
    abort,
    refresh,
    tiles: renderedTiles.length > 0 ? renderedTiles : viewportTiles,
    isDataReady,
    prefetchPhase,
  };
}
