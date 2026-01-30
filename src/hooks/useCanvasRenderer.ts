/**
 * Canvas-based heatmap rendering utilities
 * 
 * Provides efficient rendering of heatmap points using HTML Canvas
 * instead of individual DOM elements.
 */

import { HeatmapPoint, Bounds } from '@/types';
import { getColorForK } from '@/constants';

interface CanvasRenderOptions {
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
      x - cellWidthPx / 2,
      y - cellHeightPx / 2,
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
      ctx.filter = 'blur(2px)';
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none';
    }
  }
}
