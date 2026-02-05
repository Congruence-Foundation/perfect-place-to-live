import type { HeatmapPoint } from '@/types';
import type { UnifiedProperty, EnrichedUnifiedProperty } from '../lib/shared';
import { enrichPropertiesSimplified } from '../lib';
import { UI_CONFIG } from '@/constants/performance';

/**
 * Enrich fetched cluster properties with price analysis data.
 * 
 * Priority:
 * 1. Use existing enriched properties from the main list (properly compared against all properties)
 * 2. Fall back to simplified enrichment for immediate display (less accurate, compared only against cluster)
 * 
 * Note: For accurate price analysis, cluster properties should be cached and re-enriched
 * together with all properties in the parent component.
 * 
 * @param fetchedProperties - Properties fetched from the cluster API
 * @param existingEnrichedProperties - Already-enriched properties for lookup
 * @param heatmapPoints - Heatmap points for location quality calculation
 * @param gridCellSize - Grid cell size in meters (default: UI_CONFIG.DEFAULT_GRID_CELL_SIZE)
 * @returns Array of enriched properties with price analysis where available
 */
export function enrichClusterProperties(
  fetchedProperties: UnifiedProperty[],
  existingEnrichedProperties: EnrichedUnifiedProperty[],
  heatmapPoints: HeatmapPoint[],
  gridCellSize: number = UI_CONFIG.DEFAULT_GRID_CELL_SIZE
): EnrichedUnifiedProperty[] {
  // Create a map of already-enriched properties by ID for quick lookup
  const enrichedPropsMap = new Map<string, EnrichedUnifiedProperty>();
  for (const p of existingEnrichedProperties) {
    if (p.priceAnalysis) {
      enrichedPropsMap.set(p.id, p);
    }
  }
  
  // Separate properties into those we have enrichment for and those we don't
  const enrichedProps: EnrichedUnifiedProperty[] = [];
  const needsEnrichment: UnifiedProperty[] = [];
  
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
    // No heatmap data, just convert to EnrichedUnifiedProperty without analysis
    enrichedProps.push(...needsEnrichment.map((p): EnrichedUnifiedProperty => ({ ...p, priceAnalysis: undefined })));
  }
  
  return enrichedProps;
}
