/**
 * Hook for canvas-based heatmap rendering
 * 
 * Provides efficient rendering of heatmap points using HTML Canvas
 * instead of individual DOM elements.
 */

import { useRef, useCallback, useEffect } from 'react';
import { HeatmapPoint, Bounds } from '@/types';
import { getColorForK } from '@/constants';

export interface CanvasRenderOptions {
  opacity: number;
}

/**
 * Convert hex color to RGBA string
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Parse color string (hex or rgb) and return rgba
 */
function colorToRgba(color: string, alpha: number): string {
  // Handle hex format
  if (color.startsWith('#')) {
    return hexToRgba(color, alpha);
  }
  
  // Handle rgb format: rgb(r,g,b)
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  
  // Fallback - return as-is with alpha
  return color;
}

/**
 * Estimate cell size from point spacing
 * Uses the minimum spacing between sorted points to determine grid cell size
 */
function estimateCellSizeFromPoints(points: HeatmapPoint[]): { lat: number; lng: number } {
  if (points.length < 2) {
    return { lat: 0.002, lng: 0.002 };
  }

  // Get unique lat and lng values
  const uniqueLats = [...new Set(points.map(p => p.lat))].sort((a, b) => a - b);
  const uniqueLngs = [...new Set(points.map(p => p.lng))].sort((a, b) => a - b);

  // Find minimum spacing
  let minLatDiff = Infinity;
  let minLngDiff = Infinity;

  for (let i = 1; i < uniqueLats.length; i++) {
    const diff = uniqueLats[i] - uniqueLats[i - 1];
    if (diff > 0.0001 && diff < minLatDiff) {
      minLatDiff = diff;
    }
  }

  for (let i = 1; i < uniqueLngs.length; i++) {
    const diff = uniqueLngs[i] - uniqueLngs[i - 1];
    if (diff > 0.0001 && diff < minLngDiff) {
      minLngDiff = diff;
    }
  }

  // Default to ~200m in degrees if no valid spacing found
  const defaultSize = 0.002; // ~200m at mid-latitudes
  
  const result = {
    lat: minLatDiff === Infinity ? defaultSize : minLatDiff,
    lng: minLngDiff === Infinity ? defaultSize : minLngDiff,
  };
  
  console.log(`Estimated cell size: lat=${result.lat.toFixed(6)}, lng=${result.lng.toFixed(6)} from ${uniqueLats.length} unique lats, ${uniqueLngs.length} unique lngs`);
  
  return result;
}

/**
 * Render heatmap points to a canvas
 */
export function renderHeatmapToCanvas(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  bounds: Bounds,
  canvasWidth: number,
  canvasHeight: number,
  options: CanvasRenderOptions
): void {
  const { opacity } = options;

  // Clear canvas with transparent background
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (points.length === 0) return;

  // Calculate scale factors
  const boundsWidth = bounds.east - bounds.west;
  const boundsHeight = bounds.north - bounds.south;
  const scaleX = canvasWidth / boundsWidth;
  const scaleY = canvasHeight / boundsHeight;

  // Get unique lat/lng to determine grid dimensions
  const uniqueLats = [...new Set(points.map(p => p.lat))].sort((a, b) => a - b);
  const uniqueLngs = [...new Set(points.map(p => p.lng))].sort((a, b) => a - b);
  
  // Calculate cell size in pixels - make cells large enough to overlap significantly
  // This creates a smooth, blended appearance
  const baseCellWidth = canvasWidth / uniqueLngs.length;
  const baseCellHeight = canvasHeight / uniqueLats.length;
  
  // Use 2x size for heavy overlap - this blends adjacent cells
  const cellWidthPx = Math.ceil(baseCellWidth * 2);
  const cellHeightPx = Math.ceil(baseCellHeight * 2);

  console.log(`Canvas cell size: ${cellWidthPx}x${cellHeightPx}px for ${uniqueLngs.length}x${uniqueLats.length} grid, canvas: ${canvasWidth}x${canvasHeight}`);

  // Draw each point
  for (const point of points) {
    // Convert lat/lng to canvas coordinates
    // Y is inverted because canvas Y increases downward
    const x = (point.lng - bounds.west) * scaleX;
    const y = (bounds.north - point.lat) * scaleY;

    // Get color for this K value
    const color = getColorForK(point.value);
    ctx.fillStyle = colorToRgba(color, opacity);

    // Draw rectangle centered on the point
    ctx.fillRect(
      Math.round(x - cellWidthPx / 2),
      Math.round(y - cellHeightPx / 2),
      cellWidthPx,
      cellHeightPx
    );
  }
  
  // Apply a slight blur to smooth out the grid pattern
  // This is done by drawing the canvas onto itself with a blur filter
  if (ctx.filter !== undefined) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      // Copy current content
      tempCtx.drawImage(ctx.canvas, 0, 0);
      // Clear and redraw with blur
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.filter = 'blur(1px)';
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none';
    }
  }
}

/**
 * Hook for managing canvas-based heatmap rendering
 */
export function useCanvasRenderer(
  points: HeatmapPoint[],
  bounds: Bounds | null,
  options: CanvasRenderOptions
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataUrlRef = useRef<string | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return () => {
      canvasRef.current = null;
      dataUrlRef.current = null;
    };
  }, []);

  // Render to canvas and return data URL
  const render = useCallback((width: number, height: number): string | null => {
    if (!canvasRef.current || !bounds || points.length === 0) {
      return null;
    }

    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    renderHeatmapToCanvas(ctx, points, bounds, width, height, options);

    dataUrlRef.current = canvas.toDataURL('image/png');
    return dataUrlRef.current;
  }, [points, bounds, options]);

  // Get current data URL without re-rendering
  const getDataUrl = useCallback((): string | null => {
    return dataUrlRef.current;
  }, []);

  return {
    render,
    getDataUrl,
    canvasRef,
  };
}

export default useCanvasRenderer;
