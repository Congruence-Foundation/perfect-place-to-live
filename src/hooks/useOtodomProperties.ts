'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Bounds } from '@/types';
import {
  OtodomProperty,
  PropertyFilters,
  PropertyResponse,
  PropertyCluster,
  DEFAULT_PROPERTY_FILTERS,
} from '@/types/property';

interface UseOtodomPropertiesReturn {
  properties: OtodomProperty[];
  clusters: PropertyCluster[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  cached: boolean;
  fetchedAt: string | null;
  fetchProperties: (bounds: Bounds, filters?: Partial<PropertyFilters>) => Promise<void>;
  clearProperties: () => void;
  abortFetch: () => void;
}

/**
 * Hook for fetching Otodom properties with debouncing and caching
 */
export function useOtodomProperties(): UseOtodomPropertiesReturn {
  const [properties, setProperties] = useState<OtodomProperty[]>([]);
  const [clusters, setClusters] = useState<PropertyCluster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [cached, setCached] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const filtersRef = useRef<PropertyFilters>(DEFAULT_PROPERTY_FILTERS);

  const fetchProperties = useCallback(
    async (bounds: Bounds, filters?: Partial<PropertyFilters>) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller and increment request ID
      abortControllerRef.current = new AbortController();
      const currentRequestId = ++requestIdRef.current;

      // Merge filters with defaults and previous filters
      const mergedFilters: PropertyFilters = {
        ...filtersRef.current,
        ...filters,
      };
      filtersRef.current = mergedFilters;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/properties', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bounds,
            filters: mergedFilters,
          }),
          signal: abortControllerRef.current.signal,
        });

        // Check if this request is still the latest one
        if (currentRequestId !== requestIdRef.current) {
          return; // A newer request has been made, ignore this response
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP error: ${response.status}`);
        }

        const data: PropertyResponse = await response.json();

        // Double-check this is still the latest request before updating state
        if (currentRequestId === requestIdRef.current) {
          setProperties(data.properties);
          setClusters(data.clusters || []);
          setTotalCount(data.totalCount);
          setCached(data.cached);
          setFetchedAt(data.fetchedAt);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }
        // Only set error if this is still the latest request
        if (currentRequestId === requestIdRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fetch properties');
          console.error('Properties fetch error:', err);
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

  const clearProperties = useCallback(() => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    requestIdRef.current++;
    setProperties([]);
    setClusters([]);
    setTotalCount(0);
    setCached(false);
    setFetchedAt(null);
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
    properties,
    clusters,
    isLoading,
    error,
    totalCount,
    cached,
    fetchedAt,
    fetchProperties,
    clearProperties,
    abortFetch,
  };
}
