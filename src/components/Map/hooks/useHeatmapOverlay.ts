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

function clampDimension(cells: number): number {
  return Math.min(CANVAS_MAX_DIMENSION, Math.max(CANVAS_MIN_DIMENSION, cells * CANVAS_PIXELS_PER_CELL));
}

function calculateCanvasDimensions(
  latRange: number,
  lngRange: number,
  centerLat: number
): { width: number; height: number } {
  const cellsLng = Math.ceil((lngRange * metersPerDegreeLng(centerLat)) / HEATMAP_CELL_SIZE_METERS);
  const cellsLat = Math.ceil((latRange * METERS_PER_DEGREE_LAT) / HEATMAP_CELL_SIZE_METERS);
  return { width: clampDimension(cellsLng), height: clampDimension(cellsLat) };
}

const HEATMAP_PANE_NAME = 'heatmapPane';
const REPOSITION_EVENTS = ['zoomanim', 'move', 'viewreset'] as const;

/** Ensure a Leaflet pane exists, creating it with the given z-index if needed. */
function ensurePane(map: L.Map, name: string, zIndex: number): HTMLElement | undefined {
  let pane = map.getPane(name);
  if (!pane) {
    map.createPane(name);
    pane = map.getPane(name);
    if (pane) pane.style.zIndex = String(zIndex);
  }
  return pane;
}

/** Position a canvas element in a Leaflet pane to cover the given geographic bounds. */
function positionCanvasInPane(
  canvasEl: HTMLCanvasElement,
  map: L.Map,
  geoBounds: Bounds
): void {
  const L = (window as unknown as Record<string, unknown>).L as typeof import('leaflet');
  const swPoint = map.latLngToLayerPoint(L.latLng(geoBounds.south, geoBounds.west));
  const nePoint = map.latLngToLayerPoint(L.latLng(geoBounds.north, geoBounds.east));

  canvasEl.style.position = 'absolute';
  canvasEl.style.left = `${Math.min(swPoint.x, nePoint.x)}px`;
  canvasEl.style.top = `${Math.min(swPoint.y, nePoint.y)}px`;
  canvasEl.style.width = `${Math.abs(nePoint.x - swPoint.x)}px`;
  canvasEl.style.height = `${Math.abs(swPoint.y - nePoint.y)}px`;
}

export function useHeatmapOverlay({
  mapReady,
  mapInstance,
  heatmapPoints,
  heatmapOpacity,
  heatmapTileCoords,
  isHeatmapDataReady,
}: UseHeatmapOverlayOptions): void {
  const visibleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevHeatmapHashRef = useRef<string>('');
  const renderSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const currentBoundsRef = useRef<Bounds | null>(null);

  const repositionCanvas = useCallback(() => {
    if (!mapInstance || !visibleCanvasRef.current || !currentBoundsRef.current) return;
    positionCanvasInPane(visibleCanvasRef.current, mapInstance, currentBoundsRef.current);
  }, [mapInstance]);

  // Reposition the canvas when the map moves/zooms
  useEffect(() => {
    if (!mapReady || !mapInstance) return;
    
    for (const event of REPOSITION_EVENTS) mapInstance.on(event, repositionCanvas);
    return () => {
      for (const event of REPOSITION_EVENTS) mapInstance.off(event, repositionCanvas);
    };
  }, [mapReady, mapInstance, repositionCanvas]);

  // Main render effect
  useEffect(() => {
    if (!mapReady || !mapInstance) return;
    if (!isHeatmapDataReady) return;

    const currentHash = createHeatmapHash(heatmapPoints, heatmapOpacity, heatmapTileCoords);
    if (currentHash === prevHeatmapHashRef.current) return;
    prevHeatmapHashRef.current = currentHash;

    const renderSeq = ++renderSeqRef.current;

    const updateOverlay = async () => {
      try {
        if (heatmapPoints.length === 0) {
          if (heatmapTileCoords.length === 0 && visibleCanvasRef.current) {
            visibleCanvasRef.current.remove();
            visibleCanvasRef.current = null;
            currentBoundsRef.current = null;
          }
          return;
        }

        if (renderSeq <= appliedSeqRef.current) return;

        const { bounds, latRange, lngRange } = calculateBounds(heatmapTileCoords, heatmapPoints);
        const centerLat = (bounds.north + bounds.south) / 2;
        const { width: canvasWidth, height: canvasHeight } = calculateCanvasDimensions(
          latRange, lngRange, centerLat
        );

        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offscreen = offscreenCanvasRef.current;
        offscreen.width = canvasWidth;
        offscreen.height = canvasHeight;

        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;

        renderHeatmapToCanvas(offCtx, heatmapPoints, bounds, canvasWidth, canvasHeight, {
          opacity: heatmapOpacity,
          cellSizeMeters: HEATMAP_CELL_SIZE_METERS,
        });

        // Discard if a newer render was already applied
        if (renderSeq <= appliedSeqRef.current) return;

        const pane = ensurePane(mapInstance, HEATMAP_PANE_NAME, Z_INDEX.MAP_HEATMAP_PANE);
        if (!pane) return;

        if (!visibleCanvasRef.current) {
          const canvas = document.createElement('canvas');
          canvas.style.pointerEvents = 'none';
          pane.appendChild(canvas);
          visibleCanvasRef.current = canvas;
        }

        const visible = visibleCanvasRef.current;
        visible.width = canvasWidth;
        visible.height = canvasHeight;

        // Synchronous copy — no decode cycle, no flicker
        const visCtx = visible.getContext('2d');
        if (visCtx) {
          visCtx.drawImage(offscreen, 0, 0);
        }

        currentBoundsRef.current = bounds;
        positionCanvasInPane(visible, mapInstance, bounds);
        appliedSeqRef.current = renderSeq;
      } catch (error) {
        console.error('Error updating heatmap overlay:', error);
      }
    };

    updateOverlay();
  }, [mapReady, mapInstance, heatmapPoints, heatmapOpacity, heatmapTileCoords, isHeatmapDataReady]);

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
