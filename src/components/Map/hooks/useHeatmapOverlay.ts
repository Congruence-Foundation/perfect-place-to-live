'use client';

/**
 * Hook for managing heatmap canvas overlay on the map
 * Extracts heatmap rendering logic from MapView for better separation of concerns
 */

import { useEffect, useRef } from 'react';
import type { HeatmapPoint, Bounds } from '@/types';
import { Z_INDEX } from '@/constants';
import { tileToBounds, METERS_PER_DEGREE_LAT, metersPerDegreeLng } from '@/lib/geo';
import type { TileCoord } from '@/lib/geo/tiles';
import { renderHeatmapToCanvas } from '@/lib/rendering/canvasRenderer';
import {
  CANVAS_PIXELS_PER_CELL,
  CANVAS_MAX_DIMENSION,
  CANVAS_MIN_DIMENSION,
  HEATMAP_CELL_SIZE_METERS,
} from '../constants';

interface UseHeatmapOverlayOptions {
  mapReady: boolean;
  mapInstance: L.Map | null;
  heatmapPoints: HeatmapPoint[];
  heatmapOpacity: number;
  heatmapTileCoords: TileCoord[];
  isHeatmapDataReady: boolean;
}

/**
 * Creates a hash of heatmap data to detect actual changes
 * Uses length + sample of points + tiles for efficiency
 */
function createHeatmapHash(
  points: HeatmapPoint[],
  opacity: number,
  tileCoords: TileCoord[]
): string {
  if (points.length === 0) return 'empty';
  
  const sample = points
    .slice(0, 10)
    .map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.value.toFixed(3)}`)
    .join('|');
  const tilesHash = tileCoords
    .map(t => `${t.z}:${t.x}:${t.y}`)
    .sort()
    .join(',');
  
  return `${points.length}:${opacity}:${tilesHash}:${sample}`;
}

/**
 * Calculates bounds from tile coordinates or falls back to point bounds
 */
function calculateBounds(
  tileCoords: TileCoord[],
  points: HeatmapPoint[]
): { bounds: Bounds; latRange: number; lngRange: number } {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  
  if (tileCoords.length > 0) {
    // Use tile bounds for stable canvas sizing
    for (const tile of tileCoords) {
      const tileBounds = tileToBounds(tile.z, tile.x, tile.y);
      
      if (tileBounds.south < minLat) minLat = tileBounds.south;
      if (tileBounds.north > maxLat) maxLat = tileBounds.north;
      if (tileBounds.west < minLng) minLng = tileBounds.west;
      if (tileBounds.east > maxLng) maxLng = tileBounds.east;
    }
  } else {
    // Fallback to point bounds if no tiles available
    for (const point of points) {
      if (point.lat < minLat) minLat = point.lat;
      if (point.lat > maxLat) maxLat = point.lat;
      if (point.lng < minLng) minLng = point.lng;
      if (point.lng > maxLng) maxLng = point.lng;
    }
  }
  
  return {
    bounds: { north: maxLat, south: minLat, east: maxLng, west: minLng },
    latRange: maxLat - minLat,
    lngRange: maxLng - minLng,
  };
}

/**
 * Calculates canvas dimensions based on geographic area and fixed cell size
 * Note: We intentionally don't scale by DPI here - Leaflet handles the stretching
 * and the blur filter smooths the result. DPI scaling creates too many discrete
 * points that become visible as a dot pattern on high-DPI mobile devices.
 */
function calculateCanvasDimensions(
  latRange: number,
  lngRange: number,
  centerLat: number
): { width: number; height: number } {
  const cellsLng = Math.ceil((lngRange * metersPerDegreeLng(centerLat)) / HEATMAP_CELL_SIZE_METERS);
  const cellsLat = Math.ceil((latRange * METERS_PER_DEGREE_LAT) / HEATMAP_CELL_SIZE_METERS);
  
  const width = Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cellsLng * CANVAS_PIXELS_PER_CELL));
  const height = Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cellsLat * CANVAS_PIXELS_PER_CELL));
  
  return { width, height };
}

/**
 * Hook to manage heatmap canvas overlay on the map
 * 
 * @param options - Configuration options for the heatmap overlay
 */
export function useHeatmapOverlay({
  mapReady,
  mapInstance,
  heatmapPoints,
  heatmapOpacity,
  heatmapTileCoords,
  isHeatmapDataReady,
}: UseHeatmapOverlayOptions): void {
  const canvasOverlayRef = useRef<L.ImageOverlay | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const prevHeatmapHashRef = useRef<string>('');

  useEffect(() => {
    if (!mapReady || !mapInstance) return;
    
    // Skip rendering if data is not ready for current tiles
    // This prevents the "rough edges" flash when tiles change but data hasn't arrived
    if (!isHeatmapDataReady) {
      return;
    }

    const currentHash = createHeatmapHash(heatmapPoints, heatmapOpacity, heatmapTileCoords);
    if (currentHash === prevHeatmapHashRef.current) {
      return; // Data hasn't changed, skip re-render
    }
    prevHeatmapHashRef.current = currentHash;

    // Track if effect is still active (for async callback safety)
    let isActive = true;

    const updateOverlay = async () => {
      try {
        const L = (await import('leaflet')).default;
        if (!mapInstance) return;

        // If no points, remove existing overlay and return
        if (heatmapPoints.length === 0) {
          if (canvasOverlayRef.current) {
            canvasOverlayRef.current.remove();
            canvasOverlayRef.current = null;
          }
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
          }
          return;
        }

        const { bounds, latRange, lngRange } = calculateBounds(heatmapTileCoords, heatmapPoints);
        const centerLat = (bounds.north + bounds.south) / 2;
        const { width: canvasWidth, height: canvasHeight } = calculateCanvasDimensions(
          latRange,
          lngRange,
          centerLat
        );

        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }

        const canvas = offscreenCanvasRef.current;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        renderHeatmapToCanvas(ctx, heatmapPoints, bounds, canvas.width, canvas.height, {
          opacity: heatmapOpacity,
          cellSizeMeters: HEATMAP_CELL_SIZE_METERS,
        });

        const overlayBounds: L.LatLngBoundsExpression = [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ];

        canvas.toBlob((blob) => {
          // Safety check: abort if effect was cleaned up or map was destroyed
          if (!isActive || !blob || !mapInstance) return;
          
          const url = URL.createObjectURL(blob);
          const oldUrl = blobUrlRef.current;
          const oldOverlay = canvasOverlayRef.current;
          blobUrlRef.current = url;

          // Create pane if needed
          let pane = mapInstance.getPane('heatmapPane');
          if (!pane) {
            mapInstance.createPane('heatmapPane');
            pane = mapInstance.getPane('heatmapPane');
            if (pane) pane.style.zIndex = String(Z_INDEX.MAP_HEATMAP_PANE);
          }
          
          // Pre-load the new image first
          const tempImg = new Image();
          tempImg.onload = () => {
            // Safety check: abort if effect was cleaned up
            if (!isActive || !mapInstance) return;
            
            // Image is now cached - create new overlay (will load instantly)
            const newOverlay = L.imageOverlay(url, overlayBounds, {
              opacity: 1,
              interactive: false,
              pane: 'heatmapPane',
            });
            
            // Remove old overlay BEFORE adding new one to prevent double overlays
            if (oldOverlay) {
              oldOverlay.remove();
            }
            if (oldUrl) {
              URL.revokeObjectURL(oldUrl);
            }
            
            // Add new overlay to map
            newOverlay.addTo(mapInstance);
            
            // Update ref
            canvasOverlayRef.current = newOverlay;
          };
          tempImg.src = url;
        }, 'image/png');

      } catch (error) {
        console.error('Error updating heatmap overlay:', error);
      }
    };

    updateOverlay();

    return () => {
      isActive = false;
    };
  }, [mapReady, mapInstance, heatmapPoints, heatmapOpacity, heatmapTileCoords, isHeatmapDataReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (canvasOverlayRef.current) {
        canvasOverlayRef.current.remove();
        canvasOverlayRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      offscreenCanvasRef.current = null;
    };
  }, []);
}
