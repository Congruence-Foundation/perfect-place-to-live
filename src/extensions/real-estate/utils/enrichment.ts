import type { HeatmapPoint } from '@/types';
import type { OtodomProperty, EnrichedProperty } from '../types';
import { enrichPropertiesSimplified } from '../lib';
import { UI_CONFIG, CLUSTER_CONFIG } from '@/constants/performance';

/**
 * Default cluster radius for UI-level cluster analysis and price comparison.
 * Note: OTODOM_CLUSTER_RADIUS_METERS in otodom.ts (500m) is smaller and used
 * for API requests when fetching properties within a cluster area.
 */
export const DEFAULT_CLUSTER_RADIUS = CLUSTER_CONFIG.DEFAULT_RADIUS_METERS;

/**
 * Enrich fetched cluster properties with price analysis data
 * 
 * Priority:
 * 1. Use existing enriched properties from the main list (properly compared against all properties)
 * 2. Fall back to simplified enrichment for immediate display (less accurate, compared only against cluster)
 * 
 * Note: For accurate price analysis, cluster properties should be cached and re-enriched
 * together with all properties in the parent component.
 */
export function enrichClusterProperties(
  fetchedProperties: OtodomProperty[],
  existingEnrichedProperties: EnrichedProperty[],
  heatmapPoints: HeatmapPoint[],
  gridCellSize: number = UI_CONFIG.DEFAULT_GRID_CELL_SIZE
): EnrichedProperty[] {
  // Create a map of already-enriched properties by ID for quick lookup
  const enrichedPropsMap = new Map<number, EnrichedProperty>();
  for (const p of existingEnrichedProperties) {
    if (p.priceAnalysis) {
      enrichedPropsMap.set(p.id, p);
    }
  }
  
  // Separate properties into those we have enrichment for and those we don't
  const enrichedProps: EnrichedProperty[] = [];
  const needsEnrichment: OtodomProperty[] = [];
  
  for (const p of fetchedProperties) {
    const existingEnriched = enrichedPropsMap.get(p.id);
    if (existingEnriched) {
      enrichedProps.push(existingEnriched);
    } else {
      needsEnrichment.push(p);
    }
  }
  
  // For properties without existing enrichment, do simplified enrichment for immediate display
  // This is less accurate (compared only against this batch) but provides immediate feedback
  // The parent will re-enrich with all properties once they're cached
  if (needsEnrichment.length > 0 && heatmapPoints.length > 0) {
    // Combine with existing enriched for better comparison pool
    const allForEnrichment = [...needsEnrichment, ...existingEnrichedProperties.filter(p => p.priceAnalysis)];
    const newlyEnriched = enrichPropertiesSimplified(allForEnrichment, heatmapPoints, gridCellSize);
    
    // Only keep the ones we needed to enrich (not the existing ones we added for comparison)
    const needsEnrichmentIds = new Set(needsEnrichment.map(p => p.id));
    const relevantNewlyEnriched = newlyEnriched.filter(p => needsEnrichmentIds.has(p.id));
    enrichedProps.push(...relevantNewlyEnriched);
  } else if (needsEnrichment.length > 0) {
    // No heatmap data, just convert to EnrichedProperty without analysis
    enrichedProps.push(...needsEnrichment.map(p => ({ ...p } as EnrichedProperty)));
  }
  
  return enrichedProps;
}
