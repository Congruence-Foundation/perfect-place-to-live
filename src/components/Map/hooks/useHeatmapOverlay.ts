'use client';

/**
 * Hook for managing heatmap canvas overlay on the map.
 * 
 * Uses a raw <canvas> element positioned in a Leaflet pane instead of
 * L.imageOverlay. This avoids the image encode/decode cycle that causes
 * a visible flicker on each update (the browser's img.src decode is always
 * async, even for data URLs and blob URLs).
 * 
 * The canvas content is updated synchronously via drawImage(), eliminating
 * all flickering between phase transitions.
 */

import { useEffect, useRef, useCallback } from 'react';
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
  const tilesHash = tileCoords.map(t => `${t.z}:${t.x}:${t.y}`).sort().join(',');
  return `${points.length}:${opacity}:${tilesHash}:${sample}`;
}

function calculateBounds(
  tileCoords: TileCoord[],
  points: HeatmapPoint[]
): { bounds: Bounds; latRange: number; lngRange: number } {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  if (tileCoords.length > 0) {
    for (const tile of tileCoords) {
      const tb = tileToBounds(tile.z, tile.x, tile.y);
      if (tb.south < minLat) minLat = tb.south;
      if (tb.north > maxLat) maxLat = tb.north;
      if (tb.west < minLng) minLng = tb.west;
      if (tb.east > maxLng) maxLng = tb.east;
    }
  } else {
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

function calculateCanvasDimensions(
  latRange: number,
  lngRange: number,
  centerLat: number
): { width: number; height: number } {
  const cellsLng = Math.ceil((lngRange * metersPerDegreeLng(centerLat)) / HEATMAP_CELL_SIZE_METERS);
  const cellsLat = Math.ceil((latRange * METERS_PER_DEGREE_LAT) / HEATMAP_CELL_SIZE_METERS);
  return {
    width: Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cellsLng * CANVAS_PIXELS_PER_CELL)),
    height: Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cellsLat * CANVAS_PIXELS_PER_CELL)),
  };
}

/**
 * Position a canvas element in a Leaflet pane to cover the given geographic bounds.
 * Uses Leaflet's coordinate system so the canvas moves correctly during pan/zoom.
 */
function positionCanvasInPane(
  canvasEl: HTMLCanvasElement,
  map: L.Map,
  geoBounds: Bounds
): void {
  const L = (window as unknown as Record<string, unknown>).L as typeof import('leaflet');
  const sw = L.latLng(geoBounds.south, geoBounds.west);
  const ne = L.latLng(geoBounds.north, geoBounds.east);

  // Convert geographic bounds to layer pixel coordinates
  const swPoint = map.latLngToLayerPoint(sw);
  const nePoint = map.latLngToLayerPoint(ne);

  const width = Math.abs(nePoint.x - swPoint.x);
  const height = Math.abs(swPoint.y - nePoint.y);

  canvasEl.style.position = 'absolute';
  canvasEl.style.left = `${Math.min(swPoint.x, nePoint.x)}px`;
  canvasEl.style.top = `${Math.min(swPoint.y, nePoint.y)}px`;
  canvasEl.style.width = `${width}px`;
  canvasEl.style.height = `${height}px`;
}

export function useHeatmapOverlay({
  mapReady,
  mapInstance,
  heatmapPoints,
  heatmapOpacity,
  heatmapTileCoords,
  isHeatmapDataReady,
}: UseHeatmapOverlayOptions): void {
  // The visible canvas that sits in the heatmapPane (DOM element)
  const visibleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Offscreen canvas for rendering (never in the DOM)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevHeatmapHashRef = useRef<string>('');
  const renderSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  // Current geographic bounds of the visible canvas
  const currentBoundsRef = useRef<Bounds | null>(null);

  // Reposition the visible canvas when the map moves/zooms
  const repositionCanvas = useCallback(() => {
    if (!mapInstance || !visibleCanvasRef.current || !currentBoundsRef.current) return;
    positionCanvasInPane(visibleCanvasRef.current, mapInstance, currentBoundsRef.current);
  }, [mapInstance]);

  // Set up map move listener for repositioning
  useEffect(() => {
    if (!mapReady || !mapInstance) return;
    
    // Leaflet fires 'zoomanim' during zoom animation and 'move' during pan
    mapInstance.on('zoomanim', repositionCanvas);
    mapInstance.on('move', repositionCanvas);
    mapInstance.on('viewreset', repositionCanvas);
    
    return () => {
      mapInstance.off('zoomanim', repositionCanvas);
      mapInstance.off('move', repositionCanvas);
      mapInstance.off('viewreset', repositionCanvas);
    };
  }, [mapReady, mapInstance, repositionCanvas]);

  // Main render effect
  useEffect(() => {
    if (!mapReady || !mapInstance) return;
    if (!isHeatmapDataReady) return;

    const currentHash = createHeatmapHash(heatmapPoints, heatmapOpacity, heatmapTileCoords);
    if (currentHash === prevHeatmapHashRef.current) return;
    prevHeatmapHashRef.current = currentHash;

    const seq = ++renderSeqRef.current;

    const updateOverlay = async () => {
      try {
        if (!mapInstance) return;

        // Handle empty state
        if (heatmapPoints.length === 0) {
          if (heatmapTileCoords.length === 0 && visibleCanvasRef.current) {
            visibleCanvasRef.current.remove();
            visibleCanvasRef.current = null;
            currentBoundsRef.current = null;
          }
          return;
        }

        if (seq <= appliedSeqRef.current) return;

        const { bounds, latRange, lngRange } = calculateBounds(heatmapTileCoords, heatmapPoints);
        const centerLat = (bounds.north + bounds.south) / 2;
        const { width: canvasWidth, height: canvasHeight } = calculateCanvasDimensions(
          latRange, lngRange, centerLat
        );

        // Offscreen canvas for rendering
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offscreen = offscreenCanvasRef.current;
        offscreen.width = canvasWidth;
        offscreen.height = canvasHeight;

        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;

        // Render heatmap to offscreen canvas
        renderHeatmapToCanvas(offCtx, heatmapPoints, bounds, canvasWidth, canvasHeight, {
          opacity: heatmapOpacity,
          cellSizeMeters: HEATMAP_CELL_SIZE_METERS,
        });

        // Discard if a newer render was already applied while we were rendering
        if (seq <= appliedSeqRef.current) return;

        // Ensure heatmapPane exists
        let pane = mapInstance.getPane('heatmapPane');
        if (!pane) {
          mapInstance.createPane('heatmapPane');
          pane = mapInstance.getPane('heatmapPane');
          if (pane) pane.style.zIndex = String(Z_INDEX.MAP_HEATMAP_PANE);
        }
        if (!pane) return;

        // Create visible canvas if needed
        if (!visibleCanvasRef.current) {
          const canvas = document.createElement('canvas');
          canvas.style.pointerEvents = 'none';
          pane.appendChild(canvas);
          visibleCanvasRef.current = canvas;
        }

        const visible = visibleCanvasRef.current;

        // Set the visible canvas dimensions to match the rendered content
        visible.width = canvasWidth;
        visible.height = canvasHeight;

        // Copy offscreen content to visible canvas — this is SYNCHRONOUS, no decode cycle
        const visCtx = visible.getContext('2d');
        if (visCtx) {
          visCtx.drawImage(offscreen, 0, 0);
        }

        // Position the canvas in the pane using Leaflet's coordinate system
        currentBoundsRef.current = bounds;
        positionCanvasInPane(visible, mapInstance, bounds);

        appliedSeqRef.current = seq;
      } catch (error) {
        console.error('Error updating heatmap overlay:', error);
      }
    };

    updateOverlay();
  }, [mapReady, mapInstance, heatmapPoints, heatmapOpacity, heatmapTileCoords, isHeatmapDataReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (visibleCanvasRef.current) {
        visibleCanvasRef.current.remove();
        visibleCanvasRef.current = null;
      }
      offscreenCanvasRef.current = null;
      currentBoundsRef.current = null;
    };
  }, []);
}
