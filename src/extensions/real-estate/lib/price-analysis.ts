import { median, standardDeviation, quantileRank } from 'simple-statistics';
import type { HeatmapPoint } from '@/types/heatmap';
import type {
  UnifiedProperty,
  UnifiedCluster,
  EnrichedUnifiedProperty,
  LocationQualityTier,
  PriceCategory,
} from './shared/types';
import { createTimer } from '@/lib/profiling';
import { findNearestHeatmapPoint } from './score-lookup';
import { distanceInMeters, createClusterId } from '@/lib/geo';
import {
  PRICE_ANALYSIS_MIN_GROUP_SIZE,
  PRICE_ANALYSIS_MIN_SEARCH_RADIUS,
  PRICE_ANALYSIS_GRID_MULTIPLIER,
  PRICE_SCORE_THRESHOLDS,
} from '../config/constants';

/**
 * Room count ranges for grouping (overlapping for smoother comparison)
 */
const ROOM_RANGES: Array<{ min: number; max: number; label: string }> = [
  { min: 1, max: 2, label: '1-2 room' },
  { min: 2, max: 3, label: '2-3 room' },
  { min: 3, max: 4, label: '3-4 room' },
  { min: 4, max: 5, label: '4-5 room' },
  { min: 5, max: Infinity, label: '5+ room' },
];

/**
 * Area ranges for grouping (in m²)
 */
const AREA_RANGES: Array<{ min: number; max: number; label: string }> = [
  { min: 0, max: 40, label: '<40m²' },
  { min: 40, max: 55, label: '40-55m²' },
  { min: 55, max: 75, label: '55-75m²' },
  { min: 75, max: 100, label: '75-100m²' },
  { min: 100, max: Infinity, label: '100+m²' },
];

/**
 * Location quality tiers (20% windows)
 */
const QUALITY_TIERS: Array<{ min: number; max: number; tier: LocationQualityTier; label: string }> = [
  { min: 0, max: 20, tier: '0-20', label: '0-20%' },
  { min: 20, max: 40, tier: '20-40', label: '20-40%' },
  { min: 40, max: 60, tier: '40-60', label: '40-60%' },
  { min: 60, max: 80, tier: '60-80', label: '60-80%' },
  { min: 80, max: 100, tier: '80-100', label: '80-100%' },
];

/**
 * Get location quality score (0-100) from heatmap
 * @param searchRadius - Maximum search radius in meters (defaults to gridCellSize * 1.5)
 */
function getLocationQuality(
  lat: number,
  lng: number,
  heatmapPoints: HeatmapPoint[],
  searchRadius: number
): number | null {
  const nearestPoint = findNearestHeatmapPoint(lat, lng, heatmapPoints, searchRadius);
  
  if (!nearestPoint) {
    return null;
  }

  // Convert K value (0-1, lower is better) to quality (0-100, higher is better)
  return Math.round((1 - nearestPoint.value) * 100);
}

/**
 * Get quality tier from quality score
 */
function getQualityTier(quality: number): { tier: LocationQualityTier; label: string } {
  for (const t of QUALITY_TIERS) {
    if (quality >= t.min && quality < t.max) {
      return { tier: t.tier, label: t.label };
    }
  }
  // Handle edge case of exactly 100
  return { tier: '80-100', label: '80-100%' };
}

/**
 * Get room ranges that include a given room count
 */
function getRoomRanges(rooms: number): Array<{ min: number; max: number; label: string }> {
  return ROOM_RANGES.filter(r => rooms >= r.min && rooms <= r.max);
}

/**
 * Get area range for a given area
 */
function getAreaRange(area: number): { min: number; max: number; label: string } {
  for (const r of AREA_RANGES) {
    if (area >= r.min && area < r.max) {
      return r;
    }
  }
  return AREA_RANGES[AREA_RANGES.length - 1];
}

/**
 * Generate a group key for a property
 */
function generateGroupKey(
  estateType: string,
  roomRange: { label: string },
  areaRange: { label: string },
  qualityTier: LocationQualityTier
): string {
  return `${estateType}|${roomRange.label}|${areaRange.label}|${qualityTier}`;
}

/**
 * Generate human-readable comparison group description
 */
function generateGroupDescription(
  estateType: string,
  roomRange: { label: string },
  areaRange: { label: string },
  qualityLabel: string
): string {
  const estateLabel = estateType === 'FLAT' ? 'flats' : estateType === 'HOUSE' ? 'houses' : estateType.toLowerCase();
  return `${roomRange.label} ${estateLabel}, ${areaRange.label}, ${qualityLabel} quality`;
}

/**
 * Calculate price per meter for a unified property
 * Returns null if price is hidden, zero, or area is invalid
 */
export function getPricePerMeter(property: UnifiedProperty): number | null {
  // Skip properties without valid prices (null price means hidden/negotiable)
  if (property.price === null || property.price <= 0 || property.area <= 0) {
    return null;
  }
  // Use pre-calculated pricePerMeter if available
  if (property.pricePerMeter !== null && property.pricePerMeter > 0) {
    return property.pricePerMeter;
  }
  return property.price / property.area;
}

/**
 * Determine price category from price score
 */
function getPriceCategory(priceScore: number): PriceCategory {
  if (priceScore < PRICE_SCORE_THRESHOLDS.GREAT_DEAL) return 'great_deal';
  if (priceScore < PRICE_SCORE_THRESHOLDS.GOOD_DEAL) return 'good_deal';
  if (priceScore <= PRICE_SCORE_THRESHOLDS.FAIR) return 'fair';
  if (priceScore <= PRICE_SCORE_THRESHOLDS.ABOVE_AVG) return 'above_avg';
  return 'overpriced';
}

interface PropertyWithMetadata {
  property: UnifiedProperty;
  pricePerMeter: number;
  rooms: number;
  quality: number;
  qualityTier: LocationQualityTier;
  qualityLabel: string;
  areaRange: { min: number; max: number; label: string };
  roomRanges: Array<{ min: number; max: number; label: string }>;
}

interface GroupStatistics {
  medianPrice: number;
  stdDev: number;
  prices: number[];
  count: number;
  groupDescription: string;
}

/**
 * Main function to enrich properties with price analysis
 * Now works with unified property format
 * 
 * @param properties - Properties to enrich (unified format)
 * @param heatmapPoints - Heatmap points for location quality
 * @param gridCellSize - Grid cell size in meters
 * @param maxSearchRadius - Optional extended search radius (defaults to gridCellSize * 1.5)
 */
export function enrichPropertiesWithPriceScore(
  properties: UnifiedProperty[],
  heatmapPoints: HeatmapPoint[],
  gridCellSize: number,
  maxSearchRadius?: number
): EnrichedUnifiedProperty[] {
  const stopTotalTimer = createTimer('price-analysis:total');
  const searchRadius = maxSearchRadius ?? gridCellSize * 1.5;
  
  // Step 1: Prepare properties with metadata
  const stopMetadataTimer = createTimer('price-analysis:metadata');
  const propertiesWithMetadata: PropertyWithMetadata[] = [];
  
  for (const property of properties) {
    const pricePerMeter = getPricePerMeter(property);
    if (pricePerMeter === null) continue;

    // Unified properties have rooms as number | null
    const rooms = property.rooms;
    if (rooms === null || rooms === 0) continue;

    const quality = getLocationQuality(property.lat, property.lng, heatmapPoints, searchRadius);
    if (quality === null) continue;

    const { tier: qualityTier, label: qualityLabel } = getQualityTier(quality);
    const areaRange = getAreaRange(property.area);
    const roomRanges = getRoomRanges(rooms);

    propertiesWithMetadata.push({
      property,
      pricePerMeter,
      rooms,
      quality,
      qualityTier,
      qualityLabel,
      areaRange,
      roomRanges,
    });
  }
  stopMetadataTimer({ total: properties.length, valid: propertiesWithMetadata.length });

  // #region agent log
  const sourceBreakdown = propertiesWithMetadata.reduce((acc, pm) => {
    const source = pm.property.source || 'unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'price-analysis.ts:enrichPropertiesWithPriceScore',message:'Price analysis input',data:{totalProperties:properties.length,validForAnalysis:propertiesWithMetadata.length,sourceBreakdown},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'PRICE'})}).catch(()=>{});
  // #endregion

  // Step 2: Build groups (properties can belong to multiple groups due to overlapping room ranges)
  const stopGroupsTimer = createTimer('price-analysis:groups');
  const groups = new Map<string, PropertyWithMetadata[]>();

  for (const pm of propertiesWithMetadata) {
    // Add to each applicable room range group
    for (const roomRange of pm.roomRanges) {
      const key = generateGroupKey(pm.property.estateType, roomRange, pm.areaRange, pm.qualityTier);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(pm);
    }
  }
  stopGroupsTimer({ groups: groups.size });

  // #region agent log
  // Check if groups contain mixed sources
  const mixedGroups: Array<{key: string, otodom: number, gratka: number}> = [];
  for (const [key, members] of groups) {
    const otodomCount = members.filter(m => m.property.source === 'otodom').length;
    const gratkaCount = members.filter(m => m.property.source === 'gratka').length;
    if (otodomCount > 0 && gratkaCount > 0) {
      mixedGroups.push({ key, otodom: otodomCount, gratka: gratkaCount });
    }
  }
  // Log group sizes to understand distribution
  const groupSizes = Array.from(groups.entries()).map(([key, members]) => ({ key, size: members.length })).sort((a, b) => b.size - a.size);
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'price-analysis.ts:groups',message:'Price analysis groups',data:{totalGroups:groups.size,mixedSourceGroups:mixedGroups.length,sampleMixedGroups:mixedGroups.slice(0,3),minGroupSize:PRICE_ANALYSIS_MIN_GROUP_SIZE,largestGroups:groupSizes.slice(0,5),smallestGroups:groupSizes.slice(-5)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'PRICE'})}).catch(()=>{});
  // #endregion

  // Step 3: Calculate statistics for each group
  const stopStatsTimer = createTimer('price-analysis:stats');
  const groupStats = new Map<string, GroupStatistics>();

  for (const [key, members] of groups) {
    if (members.length < PRICE_ANALYSIS_MIN_GROUP_SIZE) continue;

    const prices = members.map(m => m.pricePerMeter);
    const medianPrice = median(prices);
    const stdDev = standardDeviation(prices);

    // Parse key to get group description
    const [estateType, roomLabel, areaLabel, qualityTier] = key.split('|');
    const qualityLabel = QUALITY_TIERS.find(t => t.tier === qualityTier)?.label || qualityTier;
    const groupDescription = generateGroupDescription(
      estateType,
      { label: roomLabel },
      { label: areaLabel },
      qualityLabel
    );

    groupStats.set(key, {
      medianPrice,
      stdDev,
      prices,
      count: members.length,
      groupDescription,
    });
  }
  stopStatsTimer({ groupsWithStats: groupStats.size });

  // Step 4: Calculate price analysis for each property
  const stopScoresTimer = createTimer('price-analysis:scores');
  const enrichedMap = new Map<string, EnrichedUnifiedProperty>();

  // Helper to get adjacent quality tiers for fallback
  const getAdjacentTiers = (tier: LocationQualityTier): LocationQualityTier[] => {
    const tierIndex = QUALITY_TIERS.findIndex(t => t.tier === tier);
    const adjacent: LocationQualityTier[] = [];
    if (tierIndex > 0) adjacent.push(QUALITY_TIERS[tierIndex - 1].tier);
    if (tierIndex < QUALITY_TIERS.length - 1) adjacent.push(QUALITY_TIERS[tierIndex + 1].tier);
    return adjacent;
  };

  for (const pm of propertiesWithMetadata) {
    // Find the best group (largest group size) for this property
    let bestGroup: { key: string; stats: GroupStatistics } | null = null;
    const triedKeys: string[] = [];

    // First, try the exact quality tier
    for (const roomRange of pm.roomRanges) {
      const key = generateGroupKey(pm.property.estateType, roomRange, pm.areaRange, pm.qualityTier);
      triedKeys.push(key);
      const stats = groupStats.get(key);
      if (stats && (!bestGroup || stats.count > bestGroup.stats.count)) {
        bestGroup = { key, stats };
      }
    }

    // If no valid group found, try adjacent quality tiers as fallback
    if (!bestGroup || bestGroup.stats.stdDev === 0) {
      const adjacentTiers = getAdjacentTiers(pm.qualityTier);
      for (const adjacentTier of adjacentTiers) {
        for (const roomRange of pm.roomRanges) {
          const key = generateGroupKey(pm.property.estateType, roomRange, pm.areaRange, adjacentTier);
          triedKeys.push(key);
          const stats = groupStats.get(key);
          if (stats && stats.stdDev > 0 && (!bestGroup || stats.count > bestGroup.stats.count)) {
            bestGroup = { key, stats };
          }
        }
      }
    }

    const enriched: EnrichedUnifiedProperty = { ...pm.property };

    // #region agent log
    // Log details for properties that will get no_data
    if (!bestGroup || bestGroup.stats.stdDev === 0) {
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'price-analysis.ts:noDataProperty',message:'Property getting no_data',data:{id:pm.property.id,source:pm.property.source,estateType:pm.property.estateType,rooms:pm.rooms,area:pm.property.area,areaRange:pm.areaRange,qualityTier:pm.qualityTier,triedKeys,bestGroupKey:bestGroup?.key,bestGroupCount:bestGroup?.stats.count,bestGroupStdDev:bestGroup?.stats.stdDev,groupStatsSize:groupStats.size},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'NODATA'})}).catch(()=>{});
    }
    // #endregion

    if (bestGroup && bestGroup.stats.stdDev > 0) {
      const { stats } = bestGroup;
      const priceScore = (pm.pricePerMeter - stats.medianPrice) / stats.stdDev;
      const percentile = Math.round(quantileRank(stats.prices, pm.pricePerMeter) * 100);
      const percentFromMedian = Math.round(((pm.pricePerMeter - stats.medianPrice) / stats.medianPrice) * 100);

      enriched.priceAnalysis = {
        priceScore,
        priceCategory: getPriceCategory(priceScore),
        groupMedianPrice: Math.round(stats.medianPrice),
        groupSize: stats.count,
        percentile,
        percentFromMedian,
        locationQualityTier: pm.qualityTier,
        comparisonGroup: stats.groupDescription,
      };
    } else {
      // Not enough data for comparison
      enriched.priceAnalysis = {
        priceScore: 0,
        priceCategory: 'no_data',
        groupMedianPrice: 0,
        groupSize: bestGroup?.stats.count || 0,
        percentile: 50,
        percentFromMedian: 0,
        locationQualityTier: pm.qualityTier,
        comparisonGroup: 'Insufficient data for comparison',
      };
    }

    enrichedMap.set(pm.property.id, enriched);
  }
  stopScoresTimer({ enriched: enrichedMap.size });

  // Step 5: Return all properties (enriched where possible, original otherwise)
  const result = properties.map(p => {
    const enriched = enrichedMap.get(p.id);
    if (enriched) return enriched;
    
    // Property couldn't be analyzed (hidden price, no location data, etc.)
    return {
      ...p,
      priceAnalysis: undefined,
    };
  });

  stopTotalTimer({ properties: properties.length, enriched: enrichedMap.size, groups: groupStats.size });
  return result;
}

/**
 * Filter enriched properties by price value range
 * Range is 0-100 where each 20-point segment corresponds to a category:
 * 0-20: great_deal, 20-40: good_deal, 40-60: fair, 60-80: above_avg, 80-100: overpriced
 */
export function filterPropertiesByPriceValue(
  properties: EnrichedUnifiedProperty[],
  range: [number, number]
): EnrichedUnifiedProperty[] {
  // If full range, return all
  if (range[0] === 0 && range[1] === 100) {
    return properties;
  }

  // Map category to position
  const categoryToPosition: Record<PriceCategory, number> = {
    'great_deal': 20,
    'good_deal': 40,
    'fair': 60,
    'above_avg': 80,
    'overpriced': 100,
    'no_data': 0,
  };

  return properties.filter(p => {
    if (!p.priceAnalysis) return false;
    if (p.priceAnalysis.priceCategory === 'no_data') return false;
    
    const position = categoryToPosition[p.priceAnalysis.priceCategory];
    // Check if the category's position falls within the selected range
    // A category at position X is selected if range includes (X-20, X]
    return position > range[0] && position <= range[1];
  });
}

/**
 * Result of cluster price analysis
 */
export interface ClusterPriceAnalysis {
  minCategory: PriceCategory | null;
  maxCategory: PriceCategory | null;
  propertyCount: number;
}

/**
 * Map of cluster ID to its price analysis
 */
export type ClusterAnalysisMap = Map<string, ClusterPriceAnalysis>;

/**
 * Price category order for comparison (lower = better deal)
 */
const PRICE_CATEGORY_ORDER: Record<PriceCategory, number> = {
  'great_deal': 1,
  'good_deal': 2,
  'fair': 3,
  'above_avg': 4,
  'overpriced': 5,
  'no_data': 99,
};

/**
 * Analyze cluster prices using cached cluster properties
 * 
 * In detailed mode, cluster glow should reflect the best and worst price categories
 * of properties INSIDE that cluster, not nearby properties.
 * 
 * @param clusters - Property clusters to analyze
 * @param enrichedProperties - All enriched properties (for lookup by ID)
 * @param clusterPropertiesCache - Cache of fetched cluster properties (clusterId -> properties)
 * @returns Map of cluster ID to min/max price categories
 */
export function analyzeClusterPricesFromCache(
  clusters: UnifiedCluster[],
  enrichedProperties: EnrichedUnifiedProperty[],
  clusterPropertiesCache: Map<string, { id: string }[]>
): ClusterAnalysisMap {
  const result: ClusterAnalysisMap = new Map();

  // Create a lookup map for enriched properties by ID
  const enrichedById = new Map<string, EnrichedUnifiedProperty>();
  for (const p of enrichedProperties) {
    enrichedById.set(p.id, p);
  }

  // #region agent log
  const propsWithAnalysis = enrichedProperties.filter(p => p.priceAnalysis && p.priceAnalysis.priceCategory !== 'no_data');
  fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'price-analysis.ts:analyzeClusterPricesFromCache:entry',message:'Cache-based cluster analysis',data:{totalClusters:clusters.length,totalEnrichedProps:enrichedProperties.length,propsWithAnalysis:propsWithAnalysis.length,cacheSize:clusterPropertiesCache.size,cachedClusterIds:Array.from(clusterPropertiesCache.keys()).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CACHE'})}).catch(()=>{});
  // #endregion

  for (const cluster of clusters) {
    const clusterId = createClusterId(cluster.lat, cluster.lng);
    
    // Get cached properties for this cluster
    const cachedProps = clusterPropertiesCache.get(clusterId);
    
    if (!cachedProps || cachedProps.length === 0) {
      // No cached properties - cluster not yet fetched, no glow
      result.set(clusterId, {
        minCategory: null,
        maxCategory: null,
        propertyCount: 0,
      });
      continue;
    }

    // Find enriched versions of cached properties with valid price analysis
    const clusterEnrichedProps = cachedProps
      .map(p => enrichedById.get(p.id))
      .filter((p): p is EnrichedUnifiedProperty => 
        !!p && !!p.priceAnalysis && p.priceAnalysis.priceCategory !== 'no_data'
      );

    if (clusterEnrichedProps.length === 0) {
      result.set(clusterId, {
        minCategory: null,
        maxCategory: null,
        propertyCount: cachedProps.length, // Has properties but none with analysis
      });
      continue;
    }

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'price-analysis.ts:analyzeClusterPricesFromCache:cluster',message:'Cluster has enriched props',data:{clusterId,source:cluster.source,cachedCount:cachedProps.length,enrichedCount:clusterEnrichedProps.length,categories:clusterEnrichedProps.map(p=>p.priceAnalysis?.priceCategory)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CACHE'})}).catch(()=>{});
    // #endregion

    // Find min and max categories from actual cluster properties
    let minCategory: PriceCategory | null = null;
    let maxCategory: PriceCategory | null = null;
    let minOrder = Infinity;
    let maxOrder = -Infinity;

    for (const prop of clusterEnrichedProps) {
      const category = prop.priceAnalysis!.priceCategory;
      const order = PRICE_CATEGORY_ORDER[category];

      if (order < minOrder) {
        minOrder = order;
        minCategory = category;
      }
      if (order > maxOrder) {
        maxOrder = order;
        maxCategory = category;
      }
    }

    result.set(clusterId, {
      minCategory,
      maxCategory,
      propertyCount: clusterEnrichedProps.length,
    });
  }

  return result;
}

/**
 * Analyze cluster prices using nearby enriched properties (legacy/simplified mode)
 * 
 * This uses distance-based matching to find nearby properties.
 * For detailed mode, use analyzeClusterPricesFromCache instead.
 * 
 * @param clusters - Property clusters to analyze (unified format)
 * @param enrichedProperties - Properties with price analysis data (unified format)
 * @param defaultRadius - Default search radius in meters
 * @returns Map of cluster ID to min/max price categories
 */
export function analyzeClusterPrices(
  clusters: UnifiedCluster[],
  enrichedProperties: EnrichedUnifiedProperty[],
  defaultRadius: number = 1000
): ClusterAnalysisMap {
  const result: ClusterAnalysisMap = new Map();

  for (const cluster of clusters) {
    const clusterId = createClusterId(cluster.lat, cluster.lng);
    const searchRadius = cluster.radiusInMeters || defaultRadius;

    // Find nearby properties with price analysis using distance
    const nearbyProperties = enrichedProperties.filter(p => {
      if (!p.priceAnalysis || p.priceAnalysis.priceCategory === 'no_data') {
        return false;
      }
      const distance = distanceInMeters(cluster.lat, cluster.lng, p.lat, p.lng);
      return distance <= searchRadius * 2;
    });

    if (nearbyProperties.length === 0) {
      result.set(clusterId, {
        minCategory: null,
        maxCategory: null,
        propertyCount: 0,
      });
      continue;
    }

    // Find min and max categories
    let minCategory: PriceCategory | null = null;
    let maxCategory: PriceCategory | null = null;
    let minOrder = Infinity;
    let maxOrder = -Infinity;

    for (const prop of nearbyProperties) {
      const category = prop.priceAnalysis!.priceCategory;
      const order = PRICE_CATEGORY_ORDER[category];

      if (order < minOrder) {
        minOrder = order;
        minCategory = category;
      }
      if (order > maxOrder) {
        maxOrder = order;
        maxCategory = category;
      }
    }

    result.set(clusterId, {
      minCategory,
      maxCategory,
      propertyCount: nearbyProperties.length,
    });
  }

  return result;
}

/**
 * Enrich properties with price analysis using extended search radius
 * This version works with partial/sparse heatmap data
 * 
 * Now works with unified property format
 */
export function enrichPropertiesSimplified(
  properties: UnifiedProperty[],
  heatmapPoints: HeatmapPoint[],
  gridCellSize: number
): EnrichedUnifiedProperty[] {
  // Use extended search radius for sparse heatmap data
  const maxSearchRadius = Math.max(gridCellSize * PRICE_ANALYSIS_GRID_MULTIPLIER, PRICE_ANALYSIS_MIN_SEARCH_RADIUS);
  return enrichPropertiesWithPriceScore(properties, heatmapPoints, gridCellSize, maxSearchRadius);
}
