/**
 * Canvas-based heatmap rendering utilities
 * 
 * Provides efficient rendering of heatmap points using HTML Canvas
 * instead of individual DOM elements.
 */

import type { HeatmapPoint, Bounds } from '@/types';
import { getColorForK } from '@/constants';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng } from '@/lib/geo';
import { CANVAS_CONFIG } from '@/constants/performance';

interface CanvasRenderOptions {
  opacity: number;
  /** Fixed cell size in meters. If provided, uses consistent sizing regardless of point count */
  cellSizeMeters?: number;
}

/**
 * Check if we should use enhanced gradients (larger, more gradual)
 * On mobile/high-DPI devices, the dot pattern is more visible so we need bigger gradients
 */
function shouldUseEnhancedGradients(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Use enhanced gradients on high-DPI devices (mobile phones typically have 2x+ DPI)
  const dpr = window.devicePixelRatio || 1;
  if (dpr >= 2) return true;
  
  // Also check for touch devices (mobile)
  if ('ontouchstart' in window) return true;
  
  return false;
}

/**
 * Extract RGB components from color string
 * Note: getColorForK always returns rgb(r,g,b) format without spaces
 */
function extractRgb(color: string): { r: number; g: number; b: number } | null {
  const rgbMatch = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  return null;
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

  // Handle edge case: no points to render
  if (points.length === 0) return;
  
  // Handle edge case: invalid canvas dimensions
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    console.warn('Invalid canvas dimensions for heatmap rendering');
    return;
  }

  // Calculate scale factors with protection against zero-width/height bounds
  const boundsWidth = bounds.east - bounds.west;
  const boundsHeight = bounds.north - bounds.south;
  
  // Guard against degenerate bounds (zero or negative dimensions)
  if (boundsWidth <= 0 || boundsHeight <= 0) {
    console.warn('Invalid bounds for canvas rendering: zero or negative dimensions');
    return;
  }
  
  // Guard against extremely small bounds that could cause precision issues
  if (boundsWidth < 1e-10 || boundsHeight < 1e-10) {
    console.warn('Bounds too small for canvas rendering');
    return;
  }
  
  const scaleX = canvasWidth / boundsWidth;
  const scaleY = canvasHeight / boundsHeight;

  let cellWidthDeg: number;
  let cellHeightDeg: number;

  if (cellSizeMeters && cellSizeMeters > 0) {
    // Use fixed cell size based on meters - consistent regardless of point count
    // Calculate center latitude for longitude scaling
    const centerLat = (bounds.north + bounds.south) / 2;
    const metersPerLng = metersPerDegreeLng(centerLat);
    
    // Guard against zero metersPerLng (at poles)
    if (metersPerLng <= 0) {
      console.warn('Invalid latitude for canvas rendering');
      return;
    }
    
    cellHeightDeg = cellSizeMeters / METERS_PER_DEGREE_LAT;
    cellWidthDeg = cellSizeMeters / metersPerLng;
  } else {
    // Fallback: Estimate grid dimensions from point count (legacy behavior)
    const estimatedGridDim = Math.sqrt(points.length);
    // Guard against division by zero
    if (estimatedGridDim <= 0) {
      console.warn('Cannot estimate grid dimensions from zero points');
      return;
    }
    cellWidthDeg = boundsWidth / estimatedGridDim;
    cellHeightDeg = boundsHeight / estimatedGridDim;
  }
  
  // Convert to pixels with slight overlap for smooth blending at edges
  let cellWidthPx = Math.ceil(cellWidthDeg * scaleX * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER);
  let cellHeightPx = Math.ceil(cellHeightDeg * scaleY * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER);
  
  // Ensure minimum cell size for visibility
  cellWidthPx = Math.max(cellWidthPx, CANVAS_CONFIG.MIN_CELL_SIZE_PX);
  cellHeightPx = Math.max(cellHeightPx, CANVAS_CONFIG.MIN_CELL_SIZE_PX);

  // On high-DPI/mobile devices, use larger gradients with more gradual falloff
  const useEnhanced = shouldUseEnhancedGradients();
  
  // Calculate radius for radial gradients - use larger of width/height for circular coverage
  // On mobile/high-DPI, use much larger radius for smoother blending
  const radiusMultiplier = useEnhanced ? 1.8 : 1.0;
  const cellRadius = Math.max(cellWidthPx, cellHeightPx) * radiusMultiplier;

  // Draw each point as a radial gradient circle for smooth blending
  for (const point of points) {
    // Convert lat/lng to canvas coordinates
    // Y is inverted because canvas Y increases downward
    const x = (point.lng - bounds.west) * scaleX;
    const y = (bounds.north - point.lat) * scaleY;

    // Get color for this K value
    const color = getColorForK(point.value);
    const rgb = extractRgb(color);
    if (!rgb) continue;

    // Create radial gradient: solid center, fading to transparent edge
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, cellRadius);
    if (useEnhanced) {
      // Mobile/high-DPI: very gradual falloff with large overlap
      gradient.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.7})`);
      gradient.addColorStop(0.15, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.65})`);
      gradient.addColorStop(0.3, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.5})`);
      gradient.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.35})`);
      gradient.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.2})`);
      gradient.addColorStop(0.85, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.08})`);
      gradient.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    } else {
      // Desktop: standard gradient with blur filter applied after
      gradient.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`);
      gradient.addColorStop(0.3, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.95})`);
      gradient.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.7})`);
      gradient.addColorStop(0.85, `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity * 0.3})`);
      gradient.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, cellRadius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Apply blur filter on all devices to smooth out dot patterns
  // The enhanced gradients on mobile complement (not replace) the blur
  if (ctx.filter !== undefined) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      // Copy current content
      tempCtx.drawImage(ctx.canvas, 0, 0);
      // Clear and redraw with blur to smooth tile boundaries
      // Use Math.max(dpr, 1.5) to ensure minimum effective blur even on 1x DPI screens
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const blurAmount = CANVAS_CONFIG.TILE_BOUNDARY_BLUR_PX * Math.max(dpr, 1.5);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.filter = `blur(${blurAmount}px)`;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = 'none';
    }
  }
}
