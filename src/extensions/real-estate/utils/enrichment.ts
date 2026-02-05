import type { HeatmapPoint } from '@/types';
import type { UnifiedProperty, EnrichedUnifiedProperty } from '../lib/shared';
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
 * 
 * Now works with unified property format.
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
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrichment.ts:enrichClusterProperties:lookup',message:'ID lookup results',data:{fetchedCount:fetchedProperties.length,existingEnrichedCount:existingEnrichedProperties.length,enrichedMapSize:enrichedPropsMap.size,foundInMapCount:enrichedProps.length,needsEnrichmentCount:needsEnrichment.length,heatmapPointsCount:heatmapPoints.length,sampleFetchedIds:fetchedProperties.slice(0,3).map(p=>p.id),sampleMapIds:Array.from(enrichedPropsMap.keys()).slice(0,3),foundProps:enrichedProps.map(p=>({id:p.id,hasPriceAnalysis:!!p.priceAnalysis,category:p.priceAnalysis?.priceCategory})).slice(0,3)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrichment.ts:enrichClusterProperties',message:'Enrichment analysis',data:{fetchedCount:fetchedProperties.length,existingEnrichedCount:existingEnrichedProperties.length,enrichedMapSize:enrichedPropsMap.size,alreadyEnrichedCount:enrichedProps.length,needsEnrichmentCount:needsEnrichment.length,heatmapPointsCount:heatmapPoints.length,gridCellSize,sampleFetchedId:fetchedProperties[0]?.id,sampleNeedsEnrichment:needsEnrichment[0]?{id:needsEnrichment[0].id,price:needsEnrichment[0].price,area:needsEnrichment[0].area,lat:needsEnrichment[0].lat,lng:needsEnrichment[0].lng}:null,sampleExistingEnriched:existingEnrichedProperties[0]?{id:existingEnrichedProperties[0].id,lat:existingEnrichedProperties[0].lat,lng:existingEnrichedProperties[0].lng,qualityTier:existingEnrichedProperties[0].priceAnalysis?.locationQualityTier}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'3,4,5'})}).catch(()=>{});
  // #endregion
  
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
    
    // #region agent log
    const withAnalysis = relevantNewlyEnriched.filter(p => p.priceAnalysis && p.priceAnalysis.priceCategory !== 'no_data');
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrichment.ts:enrichClusterProperties:newlyEnriched',message:'Newly enriched properties',data:{allForEnrichmentCount:allForEnrichment.length,newlyEnrichedCount:newlyEnriched.length,relevantCount:relevantNewlyEnriched.length,withAnalysisCount:withAnalysis.length,sampleEnriched:relevantNewlyEnriched[0]?{id:relevantNewlyEnriched[0].id,priceAnalysis:relevantNewlyEnriched[0].priceAnalysis}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'3,5'})}).catch(()=>{});
    // #endregion
    
    enrichedProps.push(...relevantNewlyEnriched);
  } else if (needsEnrichment.length > 0) {
    // No heatmap data, just convert to EnrichedUnifiedProperty without analysis
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrichment.ts:enrichClusterProperties:noHeatmap',message:'No heatmap data for enrichment',data:{needsEnrichmentCount:needsEnrichment.length,heatmapPointsCount:heatmapPoints.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'4'})}).catch(()=>{});
    // #endregion
    enrichedProps.push(...needsEnrichment.map(p => ({ ...p } as EnrichedUnifiedProperty)));
  }
  
  return enrichedProps;
}
