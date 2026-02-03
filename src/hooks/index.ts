export { useDebounce } from './useDebounce';
export { useHeatmapTiles } from './useHeatmapTiles';
export type { UseHeatmapTilesOptions, UseHeatmapTilesResult } from './useHeatmapTiles';
export { useIsMobile } from './useMediaQuery';
export { useSnapPoints } from './useSnapPoints';
export { useNotification } from './useNotification';
export type { Notification } from './useNotification';
export { useClickOutside } from './useClickOutside';

// Re-export from lib/rendering for backward compatibility
export { renderHeatmapToCanvas } from '@/lib/rendering/canvasRenderer';
