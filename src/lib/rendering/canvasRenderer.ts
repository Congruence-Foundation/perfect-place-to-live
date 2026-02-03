/**
 * Canvas-based heatmap rendering utilities
 * 
 * Provides efficient rendering of heatmap points using HTML Canvas
 * instead of individual DOM elements.
 */

import { HeatmapPoint, Bounds } from '@/types';
import { getColorForK } from '@/constants';
import { METERS_PER_DEGREE_LAT } from '@/lib/geo';
import { CANVAS_CONFIG } from '@/constants/performance';

interface CanvasRenderOptions {
  opacity: number;
  /** Fixed cell size in meters. If provided, uses consistent sizing regardless of point count */
  cellSizeMeters?: number;
}

/**
 * Convert rgb(r,g,b) color string to rgba with alpha
 * Note: getColorForK always returns rgb() format
 */
function rgbToRgba(color: string, alpha: number): string {
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  // Fallback - return as-is (shouldn't happen with getColorForK)
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
  const { opacity, cellSizeMeters } = options;

  // Clear canvas with transparent background
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (points.length === 0) return;

  // Calculate scale factors
  const boundsWidth = bounds.east - bounds.west;
  const boundsHeight = bounds.north - bounds.south;
  const scaleX = canvasWidth / boundsWidth;
  const scaleY = canvasHeight / boundsHeight;

  let cellWidthDeg: number;
  let cellHeightDeg: number;

  if (cellSizeMeters) {
    // Use fixed cell size based on meters - consistent regardless of point count
    // Calculate center latitude for longitude scaling
    const centerLat = (bounds.north + bounds.south) / 2;
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(centerLat * Math.PI / 180);
    
    cellHeightDeg = cellSizeMeters / METERS_PER_DEGREE_LAT;
    cellWidthDeg = cellSizeMeters / metersPerDegreeLng;
  } else {
    // Fallback: Estimate grid dimensions from point count (legacy behavior)
    const estimatedGridDim = Math.sqrt(points.length);
    cellWidthDeg = boundsWidth / estimatedGridDim;
    cellHeightDeg = boundsHeight / estimatedGridDim;
  }
  
  // Convert to pixels with slight overlap for smooth blending at edges
  let cellWidthPx = Math.ceil(cellWidthDeg * scaleX * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER);
  let cellHeightPx = Math.ceil(cellHeightDeg * scaleY * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER);
  
  // Ensure minimum cell size for visibility
  cellWidthPx = Math.max(cellWidthPx, CANVAS_CONFIG.MIN_CELL_SIZE_PX);
  cellHeightPx = Math.max(cellHeightPx, CANVAS_CONFIG.MIN_CELL_SIZE_PX);

  // Draw each point
  for (const point of points) {
    // Convert lat/lng to canvas coordinates
    // Y is inverted because canvas Y increases downward
    const x = (point.lng - bounds.west) * scaleX;
    const y = (bounds.north - point.lat) * scaleY;

    // Get color for this K value
    const color = getColorForK(point.value);
    ctx.fillStyle = rgbToRgba(color, opacity);

    // Draw rectangle centered on the point
    ctx.fillRect(
      x - cellWidthPx / 2,
      y - cellHeightPx / 2,
      cellWidthPx,
      cellHeightPx
    );
  }
  
  // Apply blur to smooth out the grid pattern and tile boundaries
  // This is done by drawing the canvas onto itself with a blur filter
  if (ctx.filter !== undefined) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      // Copy current content
      tempCtx.drawImage(ctx.canvas, 0, 0);
      // Clear and redraw with blur to smooth tile boundaries
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.filter = `blur(${CANVAS_CONFIG.TILE_BOUNDARY_BLUR_PX}px)`;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none';
    }
  }
}
