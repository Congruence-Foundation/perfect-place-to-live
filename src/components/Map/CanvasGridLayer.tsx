/**
 * Canvas-based grid layer for efficient heatmap rendering
 * 
 * This component renders heatmap points to a canvas element and displays
 * it as a Leaflet ImageOverlay, providing much better performance than
 * individual L.rectangle elements for large datasets.
 */

import { useEffect, useRef, useCallback } from 'react';
import { HeatmapPoint, Bounds } from '@/types';
import { getColorForK } from '@/constants';

interface CanvasGridLayerProps {
  map: L.Map | null;
  points: HeatmapPoint[];
  opacity: number;
  bounds: Bounds | null;
}

/**
 * Convert a hex color string to RGBA values
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Estimate cell size from points (in degrees)
 */
function estimateCellSize(points: HeatmapPoint[]): { lat: number; lng: number } {
  if (points.length < 2) {
    return { lat: 0.001, lng: 0.001 };
  }

  // Find minimum spacing between adjacent points
  const sortedByLat = [...points].sort((a, b) => a.lat - b.lat);
  const sortedByLng = [...points].sort((a, b) => a.lng - b.lng);

  let minLatDiff = Infinity;
  let minLngDiff = Infinity;

  for (let i = 1; i < Math.min(100, sortedByLat.length); i++) {
    const diff = sortedByLat[i].lat - sortedByLat[i - 1].lat;
    if (diff > 0.00001 && diff < minLatDiff) {
      minLatDiff = diff;
    }
  }

  for (let i = 1; i < Math.min(100, sortedByLng.length); i++) {
    const diff = sortedByLng[i].lng - sortedByLng[i - 1].lng;
    if (diff > 0.00001 && diff < minLngDiff) {
      minLngDiff = diff;
    }
  }

  return {
    lat: minLatDiff === Infinity ? 0.001 : minLatDiff,
    lng: minLngDiff === Infinity ? 0.001 : minLngDiff,
  };
}

/**
 * Render heatmap points to a canvas
 */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  points: HeatmapPoint[],
  bounds: Bounds,
  opacity: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (points.length === 0) return;

  // Calculate cell size
  const cellSize = estimateCellSize(points);

  // Calculate scale factors
  const boundsWidth = bounds.east - bounds.west;
  const boundsHeight = bounds.north - bounds.south;
  const scaleX = canvas.width / boundsWidth;
  const scaleY = canvas.height / boundsHeight;

  // Cell dimensions in pixels
  const cellWidthPx = Math.max(1, Math.ceil(cellSize.lng * scaleX));
  const cellHeightPx = Math.max(1, Math.ceil(cellSize.lat * scaleY));

  // Draw each point
  for (const point of points) {
    // Convert lat/lng to canvas coordinates
    // Note: Y is inverted because canvas Y increases downward
    const x = (point.lng - bounds.west) * scaleX;
    const y = (bounds.north - point.lat) * scaleY;

    // Get color for this K value
    const color = getColorForK(point.value);
    ctx.fillStyle = hexToRgba(color, opacity);

    // Draw rectangle centered on the point
    ctx.fillRect(
      x - cellWidthPx / 2,
      y - cellHeightPx / 2,
      cellWidthPx,
      cellHeightPx
    );
  }
}

/**
 * Hook to manage canvas-based grid rendering with Leaflet
 */
export function useCanvasGridLayer({
  map,
  points,
  opacity,
  bounds,
}: CanvasGridLayerProps): {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  imageOverlayRef: React.RefObject<L.ImageOverlay | null>;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);

  // Create offscreen canvas on mount
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      // Set a reasonable default size - will be updated when rendering
      canvasRef.current.width = 1024;
      canvasRef.current.height = 1024;
    }

    return () => {
      canvasRef.current = null;
    };
  }, []);

  // Update canvas and overlay when points change
  const updateOverlay = useCallback(async () => {
    if (!map || !bounds || !canvasRef.current) return;

    const L = (await import('leaflet')).default;

    // Calculate canvas size based on viewport
    const mapSize = map.getSize();
    const canvas = canvasRef.current;
    
    // Use map size for canvas, with some buffer
    canvas.width = Math.min(2048, mapSize.x * 1.5);
    canvas.height = Math.min(2048, mapSize.y * 1.5);

    // Render points to canvas
    renderToCanvas(canvas, points, bounds, opacity);

    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png');

    // Create or update image overlay
    const overlayBounds: L.LatLngBoundsExpression = [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ];

    if (imageOverlayRef.current) {
      // Update existing overlay
      imageOverlayRef.current.setUrl(dataUrl);
      imageOverlayRef.current.setBounds(L.latLngBounds(overlayBounds));
    } else {
      // Create new overlay
      imageOverlayRef.current = L.imageOverlay(dataUrl, overlayBounds, {
        opacity: 1, // Opacity is baked into the canvas
        interactive: false,
      }).addTo(map);
    }
  }, [map, points, bounds, opacity]);

  // Update overlay when dependencies change
  useEffect(() => {
    updateOverlay();
  }, [updateOverlay]);

  // Cleanup overlay on unmount
  useEffect(() => {
    return () => {
      if (imageOverlayRef.current) {
        imageOverlayRef.current.remove();
        imageOverlayRef.current = null;
      }
    };
  }, []);

  return {
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    imageOverlayRef: imageOverlayRef as React.RefObject<L.ImageOverlay | null>,
  };
}

export default useCanvasGridLayer;
