/**
 * Gratka Data Source Adapter
 *
 * Implements IPropertyDataSource interface for Gratka API.
 * Contains all Gratka-specific conversion utilities.
 */

import type { PropertyDataSource } from '../../config/filters';
import type {
  IPropertyDataSource,
  DataSourceFeature,
} from '../shared/datasource';
import { registerDataSource } from '../shared/datasource';
import type {
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedCluster,
  UnifiedProperty,
  UnifiedLocationSuggestion,
  UnifiedEstateType,
  UnifiedTransactionType,
  UnifiedOwnerType,
  UnifiedSortKey,
  UnifiedContactType,
} from '../shared/types';
import { createUnifiedId } from '../shared/types';
import {
  gratkaClient,
  buildGratkaSearchParams,
  formatGratkaPrice,
} from './client';
import type {
  GratkaPropertyNode,
  GratkaMapMarker,
  GratkaListingParametersInput,
  GratkaPropertyType,
  GratkaTransactionType,
  GratkaOwnerType,
  GratkaContactType,
  GratkaPropertyAttributes,
} from './types';
import { GRATKA_DEFAULT_MAX_MARKERS, GRATKA_DEFAULT_PAGE_SIZE } from '../../config/constants';

// ============================================================================
// Gratka-Specific Conversion Utilities
// ============================================================================

/**
 * Map Gratka transaction type to unified
 * Gratka uses 'SALE' | 'RENT', unified uses 'SELL' | 'RENT'
 */
export function mapGratkaTransaction(transaction: GratkaTransactionType): UnifiedTransactionType {
  return transaction === 'SALE' ? 'SELL' : 'RENT';
}

/**
 * Map unified transaction to Gratka format
 */
export function toGratkaTransaction(transaction: UnifiedTransactionType): GratkaTransactionType {
  return transaction === 'SELL' ? 'SALE' : 'RENT';
}

/**
 * Map Gratka property type to unified
 * Gratka uses 'PLOT', unified uses 'TERRAIN'
 */
export function mapGratkaPropertyType(
  type: GratkaPropertyType
): UnifiedEstateType {
  if (type === 'PLOT') return 'TERRAIN';
  return type as UnifiedEstateType;
}

/**
 * Map unified estate type to Gratka format
 */
export function toGratkaPropertyType(
  type: UnifiedEstateType
): GratkaPropertyType {
  if (type === 'TERRAIN') return 'PLOT';
  return type as GratkaPropertyType;
}

/**
 * Map unified owner type to Gratka format (array)
 * Gratka uses arrays for owner type filter
 */
export function toGratkaOwnerType(
  owner: UnifiedOwnerType
): GratkaOwnerType[] {
  if (owner === 'ALL') return []; // Empty array means no filter
  return [owner as GratkaOwnerType];
}

/**
 * Map unified sort key to Gratka format
 */
export function toGratkaSortKey(sort: UnifiedSortKey): { sortKey: string; sortOrder: 'ASC' | 'DESC' } {
  switch (sort) {
    case 'RELEVANCE':
      return { sortKey: 'PROMOTION_POINTS', sortOrder: 'ASC' };
    case 'PRICE_ASC':
      return { sortKey: 'PRICE', sortOrder: 'ASC' };
    case 'PRICE_DESC':
      return { sortKey: 'PRICE', sortOrder: 'DESC' };
    case 'PRICE_M2_ASC':
      return { sortKey: 'PRICE_M2', sortOrder: 'ASC' };
    case 'PRICE_M2_DESC':
      return { sortKey: 'PRICE_M2', sortOrder: 'DESC' };
    case 'AREA_ASC':
      return { sortKey: 'AREA', sortOrder: 'ASC' };
    case 'AREA_DESC':
      return { sortKey: 'AREA', sortOrder: 'DESC' };
    case 'DATE_ASC':
      return { sortKey: 'DATE', sortOrder: 'ASC' };
    case 'DATE_DESC':
      return { sortKey: 'DATE', sortOrder: 'DESC' };
    default:
      return { sortKey: 'PROMOTION_POINTS', sortOrder: 'ASC' };
  }
}

/**
 * Map Gratka contact type to unified
 */
export function mapGratkaContactType(
  type: GratkaContactType
): UnifiedContactType {
  return type; // Same values
}

// ============================================================================
// Building Material Mapping
// ============================================================================

/**
 * Map Otodom building material codes to Gratka dictionary values
 */
const BUILDING_MATERIAL_MAP: Record<string, string> = {
  'BRICK': 'BUILDING_MATERIAL_BRICK',
  'WOOD': 'BUILDING_MATERIAL_WOOD',
  'CONCRETE': 'BUILDING_MATERIAL_CONCRETE',
  'CONCRETE_PLATE': 'BUILDING_MATERIAL_LPS',
  'CELLULAR_CONCRETE': 'BUILDING_MATERIAL_YTONG',
  'SILIKAT': 'BUILDING_MATERIAL_SUPOREX',
  'BREEZEBLOCK': 'BUILDING_MATERIAL_HOLLOW_BLOCK',
  'OTHER': 'BUILDING_MATERIAL_VARIED',
  'REINFORCED_CONCRETE': 'BUILDING_MATERIAL_CONCRETE',
  'HYDROTON': 'BUILDING_MATERIAL_HOLLOW_BLOCK',
};

/**
 * Convert unified building materials to Gratka dictionaries format
 * Gratka uses a 2D array for dictionaries: [['MATERIAL_1', 'MATERIAL_2']]
 */
export function toGratkaBuildingMaterials(materials: string[]): string[][] {
  if (!materials || materials.length === 0) return [];
  const gratkaMaterials = materials
    .map(m => BUILDING_MATERIAL_MAP[m])
    .filter(Boolean);
  return gratkaMaterials.length > 0 ? [gratkaMaterials] : [];
}

// ============================================================================
// Extras/Attributes Mapping
// ============================================================================

/**
 * Map Otodom extras to Gratka property attributes
 * Note: Some Otodom extras don't have direct Gratka equivalents
 */
const EXTRAS_TO_ATTRIBUTES: Record<string, keyof GratkaPropertyAttributes> = {
  'BALCONY': 'balcony',
  'TERRACE': 'terrace',
  'BASEMENT': 'basement',
  'LIFT': 'elevator',
  'GARDEN': 'garden',
  // Note: GARAGE, SEPARATE_KITCHEN, TWO_STOREY, HAS_PHOTOS not directly supported
};

/**
 * Convert unified extras to Gratka property attributes
 */
export function toGratkaAttributes(extras: string[]): Partial<GratkaPropertyAttributes> {
  if (!extras || extras.length === 0) return {};
  
  const attrs: Partial<GratkaPropertyAttributes> = {};
  for (const extra of extras) {
    const key = EXTRAS_TO_ATTRIBUTES[extra];
    if (key) {
      attrs[key] = true;
    }
  }
  return attrs;
}

// ============================================================================
// Listing Age / Date Filter
// ============================================================================

/**
 * Convert days since created to ISO date string for Gratka dateFrom filter
 * @param daysSinceCreated - Number of days (1, 3, 7, 14, 30, 90)
 * @returns ISO date string (YYYY-MM-DD)
 */
export function toGratkaDateFrom(daysSinceCreated: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysSinceCreated);
  return date.toISOString().split('T')[0];
}

// ============================================================================
// Floor Parsing
// ============================================================================

/**
 * Parse floor number from Gratka's floorFormatted string
 * Examples: "parter" -> 0, "1 piętro" -> 1, "3" -> 3, "10 piętro" -> 10
 */
export function parseFloorFromFormatted(formatted: string | undefined | null): number | null {
  if (!formatted) return null;
  
  const lower = formatted.toLowerCase().trim();
  
  // Handle "parter" (ground floor)
  if (lower === 'parter' || lower.includes('parter')) {
    return 0;
  }
  
  // Handle "suterena" or "piwnica" (basement)
  if (lower === 'suterena' || lower === 'piwnica' || lower.includes('suteren') || lower.includes('piwnic')) {
    return -1;
  }
  
  // Extract number from string like "3 piętro", "1", "10 piętro"
  const match = formatted.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  return null;
}

// ============================================================================
// Internal Conversion Functions
// ============================================================================

/**
 * Convert unified search params to Gratka ListingParametersInput
 */
function toGratkaParams(params: UnifiedSearchParams): GratkaListingParametersInput {
  // Map unified estate types to Gratka format
  const propertyTypes = params.propertyTypes.map(toGratkaPropertyType) as GratkaPropertyType[];

  // Map market type (Gratka uses array)
  const marketType: ('PRIMARY' | 'SECONDARY')[] = [];
  if (params.market === 'PRIMARY') marketType.push('PRIMARY');
  else if (params.market === 'SECONDARY') marketType.push('SECONDARY');
  // 'ALL' means empty array (no filter)

  // Map owner type using helper (handles COMMUNE)
  const ownerType = params.owner ? toGratkaOwnerType(params.owner) : [];

  // Build base params using helper
  const baseParams = buildGratkaSearchParams({
    bounds: params.bounds,
    transaction: toGratkaTransaction(params.transaction),
    propertyType: propertyTypes,
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    areaMin: params.areaMin,
    areaMax: params.areaMax,
    rooms: params.rooms,
  });

  // Override with additional filters
  baseParams.searchParameters.marketType = marketType;
  baseParams.searchParameters.ownerType = ownerType;

  // Build year filters
  if (params.buildYearMin !== undefined) {
    baseParams.searchParameters.buildYearFrom = params.buildYearMin;
  }
  if (params.buildYearMax !== undefined) {
    baseParams.searchParameters.buildYearTo = params.buildYearMax;
  }

  // Floor filters
  if (params.floorMin !== undefined) {
    baseParams.searchParameters.floorFrom = params.floorMin;
  }
  if (params.floorMax !== undefined) {
    baseParams.searchParameters.floorTo = params.floorMax;
  }

  // Price per meter filters (Gratka uses string format)
  if (params.pricePerMeterMin !== undefined) {
    baseParams.searchParameters.priceM2From = formatGratkaPrice(params.pricePerMeterMin);
  }
  if (params.pricePerMeterMax !== undefined) {
    baseParams.searchParameters.priceM2To = formatGratkaPrice(params.pricePerMeterMax);
  }

  // Building materials filter (convert to Gratka dictionaries format)
  // Note: This requires extending UnifiedSearchParams to include buildingMaterials
  // For now, we check if it exists in the params object
  const extendedParams = params as UnifiedSearchParams & { buildingMaterials?: string[] };
  if (extendedParams.buildingMaterials && extendedParams.buildingMaterials.length > 0) {
    const dictionaries = toGratkaBuildingMaterials(extendedParams.buildingMaterials);
    if (dictionaries.length > 0) {
      baseParams.searchParameters.dictionaries = dictionaries;
    }
  }

  // Extras/amenities filter (convert to Gratka attributes format)
  // Note: This requires extending UnifiedSearchParams to include extras
  const extendedParams2 = params as UnifiedSearchParams & { extras?: string[] };
  if (extendedParams2.extras && extendedParams2.extras.length > 0) {
    const attributes = toGratkaAttributes(extendedParams2.extras);
    if (Object.keys(attributes).length > 0) {
      baseParams.searchParameters.attributes = {
        ...baseParams.searchParameters.attributes,
        ...attributes,
      };
    }
    
    // Handle HAS_PHOTOS special case
    if (extendedParams2.extras.includes('HAS_PHOTOS')) {
      baseParams.searchParameters.withPhoto = true;
    }
  }

  // Listing age filter (convert days to dateFrom)
  // Note: This requires extending UnifiedSearchParams to include daysSinceCreated
  const extendedParams3 = params as UnifiedSearchParams & { daysSinceCreated?: number };
  if (extendedParams3.daysSinceCreated) {
    baseParams.searchParameters.dateFrom = toGratkaDateFrom(extendedParams3.daysSinceCreated);
  }

  // Sort order
  if (params.sort) {
    const { sortKey, sortOrder } = toGratkaSortKey(params.sort);
    baseParams.searchOrder = { sortKey: sortKey as 'PROMOTION_POINTS' | 'PRICE' | 'PRICE_M2' | 'AREA' | 'DATE', sortOrder };
  }

  // Pagination
  baseParams.pageNumber = params.page ?? 1;
  baseParams.numberOfResults = params.pageSize ?? GRATKA_DEFAULT_PAGE_SIZE;

  return baseParams;
}

/**
 * Parse Gratka price string to number
 */
function parseGratkaPrice(price: string | undefined | null): number | null {
  if (!price) return null;
  const parsed = parseFloat(price);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse Gratka area string to number
 */
function parseGratkaArea(area: string | undefined | null): number {
  if (!area) return 0;
  const parsed = parseFloat(area);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Convert Gratka property to unified format
 */
function toUnifiedProperty(property: GratkaPropertyNode): UnifiedProperty {
  // Parse price from Gratka format - API uses 'amount' field
  // Handle null price gracefully
  const totalPrice = property.price 
    ? parseGratkaPrice(property.price.amount ?? property.price.totalPrice)
    : null;
  // Price per meter comes from priceM2.amount or fallback to pricePerSquareMeter
  const pricePerMeter = property.priceM2?.amount 
    ? parseGratkaPrice(property.priceM2.amount)
    : (property.price?.pricePerSquareMeter ? parseGratkaPrice(property.price.pricePerSquareMeter) : null);
  const area = parseGratkaArea(property.area);

  // Parse rooms (Gratka uses number or string)
  const rooms = property.rooms ?? (property.numberOfRooms ? parseInt(property.numberOfRooms, 10) : null);

  // Parse floor from formatted string
  const floor = parseFloorFromFormatted(property.floorFormatted);

  // Get coordinates - location may not have coordinates in listing response
  const lat = property.location?.coordinates?.latitude ?? property.location?.map?.center.latitude ?? 0;
  const lng = property.location?.coordinates?.longitude ?? property.location?.map?.center.longitude ?? 0;

  // #region agent log
  if (lat === 0 || lng === 0) {
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:toUnifiedProperty:noCoords',message:'Property missing coordinates',data:{id:property.id,title:property.title,locationObj:property.location?{hasCoords:!!property.location.coordinates,hasMap:!!property.location.map,coordsLat:property.location.coordinates?.latitude,coordsLng:property.location.coordinates?.longitude,mapLat:property.location.map?.center?.latitude,mapLng:property.location.map?.center?.longitude}:'null'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
  }
  // #endregion

  // Map images - Gratka uses thumbs.cdngr.pl with base64 photo.id
  const images = (property.photos ?? []).map((photo) => ({
    medium: `https://thumbs.cdngr.pl/thumb/${photo.id}/3x2_m:fill_and_crop/${photo.name}.jpg`,
    large: `https://thumbs.cdngr.pl/thumb/${photo.id}/16x9_xl:fill_and_crop/${photo.name}.jpg`,
  }));

  return {
    id: createUnifiedId('gratka', property.id),
    sourceId: property.id,
    source: 'gratka',
    lat,
    lng,
    title: property.title,
    url: property.url.startsWith('http') ? property.url : `https://gratka.pl${property.url}`,
    price: totalPrice,
    pricePerMeter,
    currency: property.price?.currency ?? 'PLN',
    area,
    rooms: rooms && !isNaN(rooms) ? rooms : null,
    floor,
    buildYear: null, // Not directly available in listing response
    images,
    isPromoted: property.isHighlighted ?? property.isPromoted ?? false,
    createdAt: property.addedAt,
    // Property type and transaction are not in listing response, use defaults
    estateType: property.propertyType
      ? (mapGratkaPropertyType(property.propertyType) as UnifiedEstateType)
      : 'FLAT',
    transaction: property.transaction
      ? (mapGratkaTransaction(property.transaction) as UnifiedTransactionType)
      : 'SELL',
    rawData: property,
  };
}

/**
 * Convert Gratka map marker to unified cluster
 */
function toUnifiedCluster(marker: GratkaMapMarker): UnifiedCluster {
  return {
    lat: marker.position.latitude,
    lng: marker.position.longitude,
    count: marker.count,
    source: 'gratka',
    bounds:
      marker.southwest && marker.northeast
        ? {
            south: marker.southwest.latitude,
            west: marker.southwest.longitude,
            north: marker.northeast.latitude,
            east: marker.northeast.longitude,
          }
        : undefined,
    url: marker.url ?? undefined,
    rawData: marker,
  };
}

/**
 * Convert non-clustered Gratka map marker to unified property
 * 
 * Non-clustered markers represent individual properties with coordinates.
 * We create a minimal property with the available data from the marker.
 */
function markerToUnifiedProperty(marker: GratkaMapMarker): UnifiedProperty | null {
  // Only convert non-clustered markers with exactly 1 property
  if (marker.clustered || marker.count !== 1 || !marker.ids || marker.ids.length === 0) {
    return null;
  }

  const propertyId = marker.ids[0];
  const price = marker.price ? parseFloat(marker.price) : null;

  return {
    id: createUnifiedId('gratka', propertyId.id),
    sourceId: propertyId.id,
    source: 'gratka',
    lat: marker.position.latitude,
    lng: marker.position.longitude,
    title: marker.label || `Property ${propertyId.id}`,
    url: marker.url ? (marker.url.startsWith('http') ? marker.url : `https://gratka.pl${marker.url}`) : `https://gratka.pl/nieruchomosci/${propertyId.id}`,
    price: price && !isNaN(price) ? price : null,
    pricePerMeter: null,
    currency: 'PLN',
    area: 0, // Not available from marker
    rooms: null,
    floor: null,
    buildYear: null,
    images: [], // Not available from marker, will be loaded on click
    isPromoted: false,
    createdAt: '',
    estateType: 'FLAT', // Default, actual type not available from marker
    transaction: 'SELL', // Default, actual type not available from marker
    rawData: marker,
  };
}

// ============================================================================
// Gratka Adapter
// ============================================================================

/**
 * Gratka data source adapter
 *
 * Implements IPropertyDataSource interface for Gratka API.
 */
export class GratkaAdapter implements IPropertyDataSource {
  readonly name: PropertyDataSource = 'gratka';
  readonly displayName = 'Gratka';

  // Features supported by Gratka
  private readonly supportedFeatures: Set<DataSourceFeature> = new Set([
    'location-suggestions',
    'map-clustering',
    'price-per-meter-filter',
    'build-year-filter',
    'floor-filter',
    'building-material-filter',
    'extras-filter',
    'listing-age-filter',
  ]);

  constructor() {
    // Register this adapter in the cache
    registerDataSource(this);
  }

  async searchProperties(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const gratkaParams = toGratkaParams(params);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:searchProperties:entry',message:'Gratka searchProperties called',data:{bounds:params.bounds,propertyTypes:params.propertyTypes,transaction:params.transaction},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    try {
      // Fetch map markers first - they have coordinates
      const mapParams = { ...gratkaParams, isMapMode: true };
      const markersResult = await gratkaClient.searchMap(mapParams, {
        numberOfMarkers: GRATKA_DEFAULT_MAX_MARKERS,
        propertyIds: [],
      }, params.signal);

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:searchProperties:markersResult',message:'Gratka searchMap returned',data:{totalMarkers:markersResult.markers.length,clusteredCount:markersResult.markers.filter(m=>m.clustered).length,nonClusteredCount:markersResult.markers.filter(m=>!m.clustered).length,sampleMarkers:markersResult.markers.slice(0,3).map(m=>({clustered:m.clustered,count:m.count,price:m.price,url:m.url,position:m.position,ids:m.ids,label:m.label}))},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      // Separate clustered and non-clustered markers
      const nonClusteredMarkers = markersResult.markers.filter(m => !m.clustered && m.count === 1 && m.ids && m.ids.length > 0);
      const clusteredMarkers = markersResult.markers.filter(m => m.clustered || m.count > 1);

      // Build a map of coordinates by property ID from non-clustered markers
      const markerCoordsById = new Map<number, { lat: number; lng: number }>();
      const propertyIds: string[] = [];
      for (const marker of nonClusteredMarkers) {
        const propId = marker.ids![0].id;
        markerCoordsById.set(propId, {
          lat: marker.position.latitude,
          lng: marker.position.longitude,
        });
        propertyIds.push(String(propId));
      }

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:searchProperties:propertyIds',message:'Property IDs to fetch',data:{count:propertyIds.length,ids:propertyIds.slice(0,10)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      // Fetch full property details for non-clustered markers using getMarkers API
      let properties: UnifiedProperty[] = [];
      if (propertyIds.length > 0) {
        const markersData = await gratkaClient.getMarkers(propertyIds, params.signal);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:searchProperties:markersData',message:'getMarkers returned',data:{count:markersData.properties.length,sampleProp:markersData.properties[0]?{id:markersData.properties[0].id,title:markersData.properties[0].title?.slice(0,30),area:markersData.properties[0].area,rooms:markersData.properties[0].numberOfRooms,photosCount:markersData.properties[0].photos?.length}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion

        // Convert to unified format and add coordinates from markers
        properties = markersData.properties
          .map(node => {
            const unified = toUnifiedProperty(node);
            // Get coordinates from marker
            const coords = markerCoordsById.get(node.id);
            if (coords) {
              unified.lat = coords.lat;
              unified.lng = coords.lng;
            }
            return unified;
          })
          .filter(p => p.lat !== 0 && p.lng !== 0);
      }

      // Clustered markers become clusters
      const clusters = clusteredMarkers.map(toUnifiedCluster);

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:searchProperties:result',message:'Gratka final result',data:{markerCoordsCount:markerCoordsById.size,enrichedPropsCount:properties.length,clustersCount:clusters.length,sampleProperty:properties[0]?{id:properties[0].id,lat:properties[0].lat,lng:properties[0].lng,area:properties[0].area,title:properties[0].title?.slice(0,30),hasImages:properties[0].images.length>0,rooms:properties[0].rooms}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      return {
        properties,
        clusters,
        totalCount: properties.length + clusters.reduce((sum, c) => sum + c.count, 0),
        cached: false, // Gratka doesn't indicate cache status
        fetchedAt: new Date().toISOString(),
        sources: ['gratka'],
      };
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'adapter.ts:searchProperties:error',message:'Gratka API error',data:{error:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack?.slice(0,500):undefined},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ERROR'})}).catch(()=>{});
      // #endregion
      throw error;
    }
  }

  async searchMapMarkers(params: UnifiedSearchParams): Promise<UnifiedCluster[]> {
    const gratkaParams = toGratkaParams(params);
    gratkaParams.isMapMode = true;

    const result = await gratkaClient.searchMap(gratkaParams, {
      numberOfMarkers: GRATKA_DEFAULT_MAX_MARKERS,
      propertyIds: [],
    }, params.signal);

    return result.markers.map(toUnifiedCluster);
  }

  async getLocationSuggestions(
    query: string,
    options?: { limit?: number }
  ): Promise<UnifiedLocationSuggestion[]> {
    const result = await gratkaClient.getLocationSuggestions({
      searchQuery: query,
      first: options?.limit ?? 10,
      after: null,
    });

    return result.edges.map((edge) => ({
      id: edge.node.id,
      name: edge.node.name,
      description: edge.node.description,
      source: 'gratka' as PropertyDataSource,
    }));
  }

  supportsFeature(feature: DataSourceFeature): boolean {
    return this.supportedFeatures.has(feature);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: GratkaAdapter | null = null;

/**
 * Get the singleton Gratka adapter instance
 */
export function getGratkaAdapter(): GratkaAdapter {
  if (!instance) {
    instance = new GratkaAdapter();
  }
  return instance;
}
