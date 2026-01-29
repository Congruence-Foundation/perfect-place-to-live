import { useState, useCallback, useRef, useEffect } from 'react';
import { Bounds, Factor, HeatmapPoint, HeatmapResponse, POI, DistanceCurve } from '@/types';

interface UseHeatmapOptions {
  debounceMs?: number;
  minZoomForFetch?: number;
}

interface UseHeatmapReturn {
  heatmapPoints: HeatmapPoint[];
  pois: Record<string, POI[]>;
  isLoading: boolean;
  error: string | null;
  metadata: HeatmapResponse['metadata'] | null;
  fetchHeatmap: (
    bounds: Bounds,
    factors: Factor[],
    gridSize?: number,
    distanceCurve?: DistanceCurve,
    sensitivity?: number,
    normalizeToViewport?: boolean
  ) => Promise<void>;
  clearHeatmap: () => void;
  abortFetch: () => void;
}

export function useHeatmap(options: UseHeatmapOptions = {}): UseHeatmapReturn {
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [pois, setPois] = useState<Record<string, POI[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<HeatmapResponse['metadata'] | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const fetchHeatmap = useCallback(
    async (
      bounds: Bounds,
      factors: Factor[],
      gridSize?: number,
      distanceCurve?: DistanceCurve,
      sensitivity?: number,
      normalizeToViewport?: boolean
    ) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller and increment request ID
      abortControllerRef.current = new AbortController();
      const currentRequestId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/heatmap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bounds,
            factors,
            gridSize,
            distanceCurve,
            sensitivity,
            normalizeToViewport,
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

        const data: HeatmapResponse = await response.json();
        
        // Double-check this is still the latest request before updating state
        if (currentRequestId === requestIdRef.current) {
          setHeatmapPoints(data.points);
          setPois(data.pois || {});
          setMetadata(data.metadata);
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
  }, []);

  const abortFetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      requestIdRef.current++;
      setIsLoading(false);
    }
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
    fetchHeatmap,
    clearHeatmap,
    abortFetch,
  };
}
