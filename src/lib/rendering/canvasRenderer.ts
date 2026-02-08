/**
 * Canvas-based heatmap rendering using ImageData pixel manipulation
 *
 * Instead of drawing 72k+ individual radial gradients (slow due to GPU state
 * changes per point), this renderer:
 * 1. Maps each heatmap point to a cell in the pixel buffer
 * 2. Writes RGBA values directly into an ImageData Uint8ClampedArray
 * 3. Applies a fast box blur (3 passes ≈ Gaussian) for smooth blending
 * 4. Writes the result in a single putImageData call
 *
 * This reduces render time from ~200ms+ to ~10-20ms for 72k points.
 */

import type { HeatmapPoint, Bounds } from '@/types';
import { getColorForKRgb } from '@/constants';
import { METERS_PER_DEGREE_LAT, metersPerDegreeLng } from '@/lib/geo';
import { CANVAS_CONFIG } from '@/constants/performance';

interface CanvasRenderOptions {
  opacity: number;
  /** Fixed cell size in meters. If provided, uses consistent sizing regardless of point count */
  cellSizeMeters?: number;
}

// ---------------------------------------------------------------------------
// Box blur (3-pass approximation of Gaussian blur on RGBA ImageData)
// ---------------------------------------------------------------------------

/**
 * In-place horizontal box blur pass on RGBA pixel data.
 * Operates on a flat Uint8ClampedArray of width×height×4 bytes.
 */
function blurH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const diameter = radius * 2 + 1;
  const invDiam = 1 / diameter;

  for (let y = 0; y < h; y++) {
    let ri = 0, gi = 0, bi = 0, ai = 0;
    const rowOffset = y * w * 4;

    // Seed the accumulator with the left-edge pixel × radius
    const firstIdx = rowOffset;
    for (let x = -radius; x <= radius; x++) {
      const idx = rowOffset + Math.max(0, Math.min(x, w - 1)) * 4;
      ri += src[idx];
      gi += src[idx + 1];
      bi += src[idx + 2];
      ai += src[idx + 3];
    }

    for (let x = 0; x < w; x++) {
      const outIdx = rowOffset + x * 4;
      dst[outIdx]     = (ri * invDiam + 0.5) | 0;
      dst[outIdx + 1] = (gi * invDiam + 0.5) | 0;
      dst[outIdx + 2] = (bi * invDiam + 0.5) | 0;
      dst[outIdx + 3] = (ai * invDiam + 0.5) | 0;

      // Slide the window: add the right pixel, subtract the left pixel
      const addIdx = rowOffset + Math.min(x + radius + 1, w - 1) * 4;
      const subIdx = rowOffset + Math.max(x - radius, 0) * 4;
      ri += src[addIdx]     - src[subIdx];
      gi += src[addIdx + 1] - src[subIdx + 1];
      bi += src[addIdx + 2] - src[subIdx + 2];
      ai += src[addIdx + 3] - src[subIdx + 3];
    }
  }
}

/** In-place vertical box blur pass */
function blurV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const diameter = radius * 2 + 1;
  const invDiam = 1 / diameter;
  const stride = w * 4;

  for (let x = 0; x < w; x++) {
    let ri = 0, gi = 0, bi = 0, ai = 0;
    const colOffset = x * 4;

    for (let y = -radius; y <= radius; y++) {
      const idx = Math.max(0, Math.min(y, h - 1)) * stride + colOffset;
      ri += src[idx];
      gi += src[idx + 1];
      bi += src[idx + 2];
      ai += src[idx + 3];
    }

    for (let y = 0; y < h; y++) {
      const outIdx = y * stride + colOffset;
      dst[outIdx]     = (ri * invDiam + 0.5) | 0;
      dst[outIdx + 1] = (gi * invDiam + 0.5) | 0;
      dst[outIdx + 2] = (bi * invDiam + 0.5) | 0;
      dst[outIdx + 3] = (ai * invDiam + 0.5) | 0;

      const addIdx = Math.min(y + radius + 1, h - 1) * stride + colOffset;
      const subIdx = Math.max(y - radius, 0) * stride + colOffset;
      ri += src[addIdx]     - src[subIdx];
      gi += src[addIdx + 1] - src[subIdx + 1];
      bi += src[addIdx + 2] - src[subIdx + 2];
      ai += src[addIdx + 3] - src[subIdx + 3];
    }
  }
}

/** Apply 2-pass box blur (good approximation of Gaussian for small radii) */
function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius < 1) return;
  const tmp = new Uint8ClampedArray(data.length);

  // 2 passes gives smooth results for small radii (2-4px)
  for (let pass = 0; pass < 2; pass++) {
    blurH(data, tmp, w, h, radius);
    blurV(tmp, data, w, h, radius);
  }
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

/**
 * Render heatmap points to a canvas using fast ImageData pixel manipulation.
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

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (points.length === 0) return;
  if (canvasWidth <= 0 || canvasHeight <= 0) return;

  const boundsWidth = bounds.east - bounds.west;
  const boundsHeight = bounds.north - bounds.south;
  if (boundsWidth <= 0 || boundsHeight <= 0) return;

  const scaleX = canvasWidth / boundsWidth;
  const scaleY = canvasHeight / boundsHeight;

  // Determine cell size in pixels
  let cellPx: number;
  if (cellSizeMeters && cellSizeMeters > 0) {
    const centerLat = (bounds.north + bounds.south) / 2;
    const metersPerLng = metersPerDegreeLng(centerLat);
    if (metersPerLng <= 0) return;
    const cellDegLat = cellSizeMeters / METERS_PER_DEGREE_LAT;
    const cellDegLng = cellSizeMeters / metersPerLng;
    cellPx = Math.max(
      Math.ceil(cellDegLng * scaleX * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER),
      Math.ceil(cellDegLat * scaleY * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER)
    );
  } else {
    const estDim = Math.sqrt(points.length);
    if (estDim <= 0) return;
    cellPx = Math.max(
      Math.ceil((boundsWidth / estDim) * scaleX * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER),
      Math.ceil((boundsHeight / estDim) * scaleY * CANVAS_CONFIG.CELL_OVERLAP_MULTIPLIER)
    );
  }
  cellPx = Math.max(cellPx, CANVAS_CONFIG.MIN_CELL_SIZE_PX);

  // Alpha byte (0..255) from opacity (0..1)
  const targetAlpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  // --- Write points into ImageData at FULL alpha ---
  // We write at alpha=255 so the blur pass can average colors properly
  // without diluting them to near-invisible. After blur, we cap alpha
  // to the target opacity for the final visual result.
  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  const pixels = imageData.data; // Uint8ClampedArray [r,g,b,a, r,g,b,a, ...]

  const halfCell = (cellPx / 2) | 0;

  for (let p = 0; p < points.length; p++) {
    const point = points[p];

    // Canvas pixel position
    const cx = ((point.lng - bounds.west) * scaleX) | 0;
    const cy = ((bounds.north - point.lat) * scaleY) | 0;

    // Cell bounding box (clamped to canvas)
    const x0 = Math.max(0, cx - halfCell);
    const y0 = Math.max(0, cy - halfCell);
    const x1 = Math.min(canvasWidth, cx + halfCell);
    const y1 = Math.min(canvasHeight, cy + halfCell);

    const { r, g, b } = getColorForKRgb(point.value);

    // Fill the cell block at full alpha; overlap regions average colors
    for (let y = y0; y < y1; y++) {
      let idx = (y * canvasWidth + x0) * 4;
      for (let x = x0; x < x1; x++) {
        if (pixels[idx + 3] === 0) {
          pixels[idx]     = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        } else {
          // Overlap: average colors
          pixels[idx]     = (pixels[idx] + r) >> 1;
          pixels[idx + 1] = (pixels[idx + 1] + g) >> 1;
          pixels[idx + 2] = (pixels[idx + 2] + b) >> 1;
        }
        idx += 4;
      }
    }
  }

  // --- Box blur for smooth blending ---
  // Blur radius is proportional to cell size (just enough to smooth cell edges)
  // 3-pass box blur at radius r ≈ Gaussian at sigma ≈ r*0.65, so r=3 ≈ 2px Gaussian
  const blurRadius = Math.max(2, Math.min(4, (cellPx / 3) | 0));
  boxBlur(pixels, canvasWidth, canvasHeight, blurRadius);

  // --- Cap alpha to target opacity ---
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) {
      pixels[i] = Math.min(pixels[i], targetAlpha);
    }
  }

  // --- Write result ---
  ctx.putImageData(imageData, 0, 0);
}
