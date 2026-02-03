/**
 * Map-specific constants
 */

// Map initialization
export const MAP_INIT_DELAY_MS = 100;

// Canvas rendering configuration
export const CANVAS_PIXELS_PER_CELL = 4;
export const CANVAS_MAX_DIMENSION = 4096;
export const CANVAS_MIN_DIMENSION = 256;

// POI marker styling
export const POI_MARKER_RADIUS = 6;
export const POI_MARKER_BORDER_WIDTH = 2;
export const POI_MARKER_FILL_OPACITY = 0.8;
export const POI_TOOLTIP_OFFSET_Y = -8;

// Animation durations
export const FLY_TO_DURATION = 1.5;
export const FIT_BOUNDS_DURATION = 1.5;
export const FIT_BOUNDS_MAX_ZOOM = 14;
export const FIT_BOUNDS_PADDING = 50;

// Leaflet CDN URLs
export const LEAFLET_ICON_URLS = {
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
} as const;

// OpenStreetMap tile configuration
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Heatmap cell size in meters
export const HEATMAP_CELL_SIZE_METERS = 100;
