import { useState, useCallback, useRef, useEffect } from 'react';
import { decode } from '@msgpack/msgpack';
import { Bounds, Factor, HeatmapPoint, HeatmapResponse, POI, DistanceCurve, DataSource } from '@/types';

interface UseHeatmapReturn {
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  isLoading: boolean;
  error: string | null;
  metadata: HeatmapResponse['metadata'] | null;
  /** True when system fell back to Overpass because Neon had no data */
  usedFallback: boolean;
  fetchHeatmap: (
    bounds: Bounds,
    factors: Factor[],
    gridSize?: number,
    distanceCurve?: DistanceCurve,
    sensitivity?: number,
    normalizeToViewport?: boolean,
    dataSource?: DataSource
  ) => Promise<void>;
  clearHeatmap: () => void;
  abortFetch: () => void;
  /** Clear the fallback notification */
  clearFallbackNotification: () => void;
}

export function useHeatmap(): UseHeatmapReturn {
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [pois, setPois] = useState<Record<string, POI[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<HeatmapResponse['metadata'] | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  // Track what data source was requested to detect fallback
  const requestedDataSourceRef = useRef<DataSource>('neon');

  const fetchHeatmap = useCallback(
    async (
      bounds: Bounds,
      factors: Factor[],
      gridSize?: number,
      distanceCurve?: DistanceCurve,
      sensitivity?: number,
      normalizeToViewport?: boolean,
      dataSource?: DataSource
    ) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller and increment request ID
      abortControllerRef.current = new AbortController();
      const currentRequestId = ++requestIdRef.current;
      
      // Track what was requested
      requestedDataSourceRef.current = dataSource || 'neon';

      setIsLoading(true);
      setError(null);
      setUsedFallback(false);

      try {
        // Request MessagePack format for smaller payload (~30% reduction)
        const response = await fetch('/api/heatmap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/msgpack',
          },
          body: JSON.stringify({
            bounds,
            factors,
            gridSize,
            distanceCurve,
            sensitivity,
            normalizeToViewport,
            dataSource,
          }),
          signal: abortControllerRef.current.signal,
        });

        // Check if this request is still the latest one
        if (currentRequestId !== requestIdRef.current) {
          return; // A newer request has been made, ignore this response
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.error === 'Viewport too large') {
            throw new Error('Zoom in to see the heatmap');
          }
          throw new Error(errorData.message || `HTTP error: ${response.status}`);
        }

        // Check if response is MessagePack or JSON
        const contentType = response.headers.get('Content-Type');
        
        let data: HeatmapResponse;
        if (contentType === 'application/msgpack') {
          // Decode MessagePack format
          const buffer = await response.arrayBuffer();
          data = decode(new Uint8Array(buffer)) as HeatmapResponse;
        } else {
          // Fallback to JSON format
          data = await response.json();
        }
        
        // Double-check this is still the latest request before updating state
        if (currentRequestId === requestIdRef.current) {
          setHeatmapPoints(data.points);
          setPois(data.pois || {});
          setMetadata(data.metadata);
          
          // Check if fallback occurred: requested neon but got overpass
          const requestedNeon = requestedDataSourceRef.current === 'neon';
          const gotOverpass = data.metadata?.dataSource === 'overpass';
          if (requestedNeon && gotOverpass) {
            setUsedFallback(true);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }
        // Only set error if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch heatmap');
          console.error('Heatmap fetch error:', err);
        }
      } finally {
        // Only update loading state if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const clearHeatmap = useCallback(() => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    requestIdRef.current++;
    setHeatmapPoints([]);
    setPois({});
    setMetadata(null);
    setError(null);
    setIsLoading(false);
    setUsedFallback(false);
  }, []);

  const abortFetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      requestIdRef.current++;
      setIsLoading(false);
    }
  }, []);

  const clearFallbackNotification = useCallback(() => {
    setUsedFallback(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    heatmapPoints,
    pois,
    isLoading,
    error,
    metadata,
    usedFallback,
    fetchHeatmap,
    clearHeatmap,
    abortFetch,
    clearFallbackNotification,
  };
}
