/**
 * Marker utility functions for real estate extension
 *
 * Extracted from useRealEstateMarkers to improve modularity and testability.
 */

import type { EnrichedUnifiedProperty, PriceCategory, UnifiedEstateType } from '../lib/shared';
import type { PropertyFilters, ClusterPriceDisplay } from '../types';
import type { HeatmapPoint, ClusterPriceAnalysisMode } from '@/types';
import type { ClusterAnalysisMap } from '../lib/price-analysis';
import type { UnifiedCluster, UnifiedProperty } from '../lib/shared';
import { findMinMaxCategories } from '../lib/price-analysis';
import { CLUSTER_CONFIG } from '@/constants/performance';

// =============================================================================
// Types
// =============================================================================

/** Response from cluster properties API */
export interface ClusterPropertiesResponse {
  properties: UnifiedProperty[];
  totalCount: number;
}

/** Context for marker operations */
export interface MarkerContext {
  L: typeof import('leaflet');
  map: L.Map;
  layerGroup: L.LayerGroup;
  propertyMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  clusterMarkersRef: React.MutableRefObject<Map<string, L.Marker>>;
  clusterPopupDataRef: React.MutableRefObject<Map<string, EnrichedUnifiedProperty[]>>;
  clusterUpdateLockRef: React.MutableRefObject<Set<string>>;
  currentClusterRequestRef: React.MutableRefObject<string | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

/** Options for updating property markers */
export interface PropertyMarkerOptions {
  properties: EnrichedUnifiedProperty[];
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  createPropertyIcon: (
    estateType: UnifiedEstateType,
    priceCategory?: PriceCategory,
    price?: number | null
  ) => L.DivIcon | null;
}

/** Options for updating cluster markers */
export interface ClusterMarkerOptions {
  clusters: UnifiedCluster[];
  properties: EnrichedUnifiedProperty[];
  /** All enriched properties (including cluster properties) for enrichment lookup */
  allEnrichedProperties: EnrichedUnifiedProperty[];
  filters: PropertyFilters;
  clusterPriceDisplay: ClusterPriceDisplay;
  clusterPriceAnalysis: ClusterPriceAnalysisMode;
  detailedModeThreshold: number;
  heatmapPoints: HeatmapPoint[];
  gridCellSize: number;
  clusterPropertiesCache: Map<string, UnifiedProperty[]>;
  clusterAnalysisData: ClusterAnalysisMap;
  onClusterPropertiesFetched: (clusterId: string, properties: UnifiedProperty[]) => void;
  /** Translations for error messages */
  translations: {
    noOffersFound: string;
    loadError: string;
  };
}

/** Result of cluster price category computation */
export interface ClusterPriceCategoryResult {
  minCategory: PriceCategory | null;
  maxCategory: PriceCategory | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build request body for cluster properties API
 */
export function buildClusterFetchBody(
  cluster: UnifiedCluster,
  filters: PropertyFilters,
  limit: number
): object {
  return {
    lat: cluster.lat,
    lng: cluster.lng,
    filters,
    page: 1,
    limit: Math.min(cluster.count, limit),
    shape: cluster.shape,
    radius: cluster.radiusInMeters || CLUSTER_CONFIG.DEFAULT_RADIUS_METERS,
    estateType: cluster.estateType,
    source: cluster.source,
    // Gratka-specific: pass URL and bounds for efficient cluster fetching
    clusterUrl: cluster.url,
    clusterBounds: cluster.bounds,
  };
}

/**
 * Compute cluster price categories from analysis data or enriched properties.
 * Tries analysis data first, falls back to computing from enriched cached props.
 */
export function computeClusterPriceCategories(
  clusterId: string,
  cachedClusterProps: UnifiedProperty[] | undefined,
  enrichedPropsMap: Map<string, EnrichedUnifiedProperty>,
  clusterAnalysisData: ClusterAnalysisMap | undefined
): ClusterPriceCategoryResult {
  // Try analysis data first
  const analysisData = clusterAnalysisData?.get(clusterId);
  if (analysisData && analysisData.propertyCount > 0) {
    return {
      minCategory: analysisData.minCategory,
      maxCategory: analysisData.maxCategory,
    };
  }

  // Fallback: compute from enriched cached props
  if (cachedClusterProps && cachedClusterProps.length > 0) {
    const enrichedCachedProps = cachedClusterProps
      .map(p => enrichedPropsMap.get(p.id))
      .filter((p): p is EnrichedUnifiedProperty => !!p && !!p.priceAnalysis);

    if (enrichedCachedProps.length > 0) {
      return findMinMaxCategories(enrichedCachedProps);
    }
  }

  return { minCategory: null, maxCategory: null };
}

/**
 * Clear all markers from a ref and remove them from the layer group
 */
export function clearMarkersFromRef(
  markersRef: React.MutableRefObject<Map<string, L.Marker>>,
  layerGroup: L.LayerGroup
): void {
  if (markersRef.current.size > 0) {
    markersRef.current.forEach((marker) => {
      layerGroup.removeLayer(marker);
    });
    markersRef.current.clear();
  }
}

/**
 * Build enriched properties map for efficient lookup
 */
export function buildEnrichedPropsMap(
  properties: EnrichedUnifiedProperty[]
): Map<string, EnrichedUnifiedProperty> {
  const map = new Map<string, EnrichedUnifiedProperty>();
  for (const p of properties) {
    map.set(p.id, p);
  }
  return map;
}

/**
 * Compute a hash of property price categories for change detection
 */
export function computePropertiesPriceHash(properties: EnrichedUnifiedProperty[]): string {
  return properties
    .map(p => `${p.id}:${p.priceAnalysis?.priceCategory || 'none'}`)
    .sort()
    .join(',');
}
