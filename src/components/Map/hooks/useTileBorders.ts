/**
 * Hook for rendering debug tile borders on the map
 * Extracts tile border rendering logic from MapView for better separation of concerns
 */

import { useEffect, useRef } from 'react';
import { tileToBounds } from '@/lib/geo';
import type { TileCoord } from '@/lib/geo/tiles';
import { DEBUG_COLORS, Z_INDEX } from '@/constants';
import { useMapStore } from '@/stores/mapStore';

interface TileBorderConfig {
  tiles: TileCoord[];
  color: string;
  labelPrefix: string;
  dashArray: string;
  labelOffsetY: string;
}

/**
 * Renders a single tile border with label
 */
function renderTileBorder(
  L: typeof import('leaflet'),
  layerGroup: L.LayerGroup,
  tile: TileCoord,
  config: TileBorderConfig
): void {
  const bounds = tileToBounds(tile.z, tile.x, tile.y);
  
  // Draw rectangle border
  const rect = L.rectangle(
    [[bounds.south, bounds.west], [bounds.north, bounds.east]],
    {
      color: config.color,
      weight: 2,
      fill: false,
      dashArray: config.dashArray,
      interactive: false,
      pane: 'tileBorderPane',
    }
  );
  rect.addTo(layerGroup);
  
  // Add tile label at center
  const center: [number, number] = [
    (bounds.north + bounds.south) / 2,
    (bounds.east + bounds.west) / 2,
  ];
  
  const label = L.marker(center, {
    icon: L.divIcon({
      className: '',
      html: `<div style="background-color: ${config.color}; opacity: 1; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; font-family: monospace; white-space: nowrap; transform: translate(-50%, ${config.labelOffsetY}); box-shadow: 0 1px 3px rgba(0,0,0,0.4);">${config.labelPrefix} ${tile.z}/${tile.x}/${tile.y}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    }),
    interactive: false,
    pane: 'tileBorderPane',
  });
  label.addTo(layerGroup);
}

/**
 * Renders all tiles for a given configuration
 */
function renderTileSet(
  L: typeof import('leaflet'),
  layerGroup: L.LayerGroup,
  config: TileBorderConfig
): void {
  for (const tile of config.tiles) {
    renderTileBorder(L, layerGroup, tile, config);
  }
}

/**
 * Hook to render debug tile borders on the map
 * Supports both heatmap and property tile visualization
 */
export function useTileBorders(
  mapReady: boolean,
  mapInstance: L.Map | null
): void {
  const tileBorderLayerRef = useRef<L.LayerGroup | null>(null);
  
  // Read debug tile state from store
  const showHeatmapTileBorders = useMapStore((s) => s.showHeatmapTileBorders);
  const showPropertyTileBorders = useMapStore((s) => s.showPropertyTileBorders);
  const heatmapTiles = useMapStore((s) => s.heatmapDebugTiles);
  const propertyTiles = useMapStore((s) => s.extensionDebugTiles);

  useEffect(() => {
    if (!mapReady || !mapInstance) return;
    
    // If neither border type is enabled, clear and return
    if (!showHeatmapTileBorders && !showPropertyTileBorders) {
      if (tileBorderLayerRef.current) {
        tileBorderLayerRef.current.clearLayers();
      }
      return;
    }

    const renderTileBorders = async () => {
      try {
        const L = (await import('leaflet')).default;
        const map = mapInstance;
        if (!map) return;

        // Create or clear tile border layer
        if (!tileBorderLayerRef.current) {
          // Create a pane for tile borders above the heatmap
          let tileBorderPane = map.getPane('tileBorderPane');
          if (!tileBorderPane) {
            map.createPane('tileBorderPane');
            tileBorderPane = map.getPane('tileBorderPane');
            if (tileBorderPane) {
              tileBorderPane.style.zIndex = String(Z_INDEX.MAP_TILE_BORDER_PANE);
              tileBorderPane.style.pointerEvents = 'none';
            }
          }
          tileBorderLayerRef.current = L.layerGroup([], { pane: 'tileBorderPane' }).addTo(map);
        }
        tileBorderLayerRef.current.clearLayers();

        // Render heatmap tile borders
        if (showHeatmapTileBorders && heatmapTiles.length > 0) {
          renderTileSet(L, tileBorderLayerRef.current, {
            tiles: heatmapTiles,
            color: DEBUG_COLORS.HEATMAP_TILE_BORDER,
            labelPrefix: 'H',
            dashArray: '5, 5',
            labelOffsetY: '-100%',
          });
        }

        // Render property tile borders
        if (showPropertyTileBorders && propertyTiles.length > 0) {
          renderTileSet(L, tileBorderLayerRef.current, {
            tiles: propertyTiles,
            color: DEBUG_COLORS.PROPERTY_TILE_BORDER,
            labelPrefix: 'P',
            dashArray: '3, 3',
            labelOffsetY: '5px',
          });
        }
      } catch (error) {
        console.error('Error rendering tile borders:', error);
      }
    };

    renderTileBorders();
  }, [mapReady, mapInstance, showHeatmapTileBorders, showPropertyTileBorders, heatmapTiles, propertyTiles]);
}
