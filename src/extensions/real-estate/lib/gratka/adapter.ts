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
} from '../shared/types';
import { createUnifiedId } from '../shared/types';
import {
  gratkaClient,
  buildGratkaSearchParams,
  formatGratkaDecimal,
} from './client';
import type {
  GratkaPropertyNode,
  GratkaMapMarker,
  GratkaListingParametersInput,
  GratkaPropertyType,
  GratkaTransactionType,
  GratkaOwnerType,
  GratkaPropertyAttributes,
} from './types';
import { GRATKA_DEFAULT_MAX_MARKERS, GRATKA_DEFAULT_PAGE_SIZE, GRATKA_BASE_URL, GRATKA_CDN_URL } from '../../config/constants';

// ============================================================================
// Type Mapping Utilities (Internal)
// ============================================================================

/** Map Gratka transaction type to unified (SALE -> SELL) */
function mapGratkaTransaction(transaction: GratkaTransactionType): UnifiedTransactionType {
  return transaction === 'SALE' ? 'SELL' : 'RENT';
}

/** Map unified transaction to Gratka format (SELL -> SALE) */
function toGratkaTransaction(transaction: UnifiedTransactionType): GratkaTransactionType {
  return transaction === 'SELL' ? 'SALE' : 'RENT';
}

/** Map Gratka property type to unified (PLOT -> TERRAIN) */
function mapGratkaPropertyType(type: GratkaPropertyType): UnifiedEstateType {
  return type === 'PLOT' ? 'TERRAIN' : (type as UnifiedEstateType);
}

/** Map unified estate type to Gratka format (TERRAIN -> PLOT) */
function toGratkaPropertyType(type: UnifiedEstateType): GratkaPropertyType {
  return type === 'TERRAIN' ? 'PLOT' : (type as GratkaPropertyType);
}

/** Map unified owner type to Gratka format (array) */
function toGratkaOwnerType(owner: UnifiedOwnerType): GratkaOwnerType[] {
  return owner === 'ALL' ? [] : [owner as GratkaOwnerType];
}

/** Sort key mapping from unified to Gratka format */
const SORT_KEY_MAP: Record<UnifiedSortKey, { sortKey: string; sortOrder: 'ASC' | 'DESC' }> = {
  RELEVANCE: { sortKey: 'PROMOTION_POINTS', sortOrder: 'ASC' },
  PRICE_ASC: { sortKey: 'PRICE', sortOrder: 'ASC' },
  PRICE_DESC: { sortKey: 'PRICE', sortOrder: 'DESC' },
  PRICE_M2_ASC: { sortKey: 'PRICE_M2', sortOrder: 'ASC' },
  PRICE_M2_DESC: { sortKey: 'PRICE_M2', sortOrder: 'DESC' },
  AREA_ASC: { sortKey: 'AREA', sortOrder: 'ASC' },
  AREA_DESC: { sortKey: 'AREA', sortOrder: 'DESC' },
  DATE_ASC: { sortKey: 'DATE', sortOrder: 'ASC' },
  DATE_DESC: { sortKey: 'DATE', sortOrder: 'DESC' },
};

/** Map unified sort key to Gratka format */
function toGratkaSortKey(sort: UnifiedSortKey): { sortKey: string; sortOrder: 'ASC' | 'DESC' } {
  return SORT_KEY_MAP[sort] ?? SORT_KEY_MAP.RELEVANCE;
}

// ============================================================================
// Building Material & Extras Mapping (Internal)
// ============================================================================

/** Map unified building material codes to Gratka dictionary values */
const BUILDING_MATERIAL_MAP: Record<string, string> = {
  BRICK: 'BUILDING_MATERIAL_BRICK',
  WOOD: 'BUILDING_MATERIAL_WOOD',
  CONCRETE: 'BUILDING_MATERIAL_CONCRETE',
  CONCRETE_PLATE: 'BUILDING_MATERIAL_LPS',
  CELLULAR_CONCRETE: 'BUILDING_MATERIAL_YTONG',
  SILIKAT: 'BUILDING_MATERIAL_SUPOREX',
  BREEZEBLOCK: 'BUILDING_MATERIAL_HOLLOW_BLOCK',
  OTHER: 'BUILDING_MATERIAL_VARIED',
  REINFORCED_CONCRETE: 'BUILDING_MATERIAL_CONCRETE',
  HYDROTON: 'BUILDING_MATERIAL_HOLLOW_BLOCK',
};

/** Map unified extras to Gratka property attributes */
const EXTRAS_TO_ATTRIBUTES: Record<string, keyof GratkaPropertyAttributes> = {
  BALCONY: 'balcony',
  TERRACE: 'terrace',
  BASEMENT: 'basement',
  LIFT: 'elevator',
  GARDEN: 'garden',
  GARAGE: 'parkingPlaces',
};

/** Convert unified building materials to Gratka dictionaries format (2D array) */
function toGratkaBuildingMaterials(materials: string[]): string[][] {
  if (!materials?.length) return [];
  const gratkaMaterials = materials.map(m => BUILDING_MATERIAL_MAP[m]).filter(Boolean);
  return gratkaMaterials.length > 0 ? [gratkaMaterials] : [];
}

/** Convert unified extras to Gratka property attributes */
function toGratkaAttributes(extras: string[]): Partial<GratkaPropertyAttributes> {
  if (!extras?.length) return {};
  const attrs: Partial<GratkaPropertyAttributes> = {};
  for (const extra of extras) {
    const key = EXTRAS_TO_ATTRIBUTES[extra];
    if (key) attrs[key] = true;
  }
  return attrs;
}

/** Convert days since created to ISO date string for Gratka dateFrom filter */
function toGratkaDateFrom(daysSinceCreated: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysSinceCreated);
  return date.toISOString().split('T')[0];
}

// ============================================================================
// Floor Parsing (Internal)
// ============================================================================

/**
 * Parse floor number from Gratka's floorFormatted string
 * Examples: "parter" -> 0, "1 piętro" -> 1, "suterena" -> -1
 */
function parseFloorFromFormatted(formatted: string | undefined | null): number | null {
  if (!formatted) return null;
  
  const lower = formatted.toLowerCase().trim();
  
  // Ground floor
  if (lower.includes('parter')) return 0;
  
  // Basement
  if (lower.includes('suteren') || lower.includes('piwnic')) return -1;
  
  // Extract number from string like "3 piętro", "1", "10 piętro"
  const match = formatted.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ============================================================================
// Parsing Utilities (Internal)
// ============================================================================

/** Parse Gratka numeric string to number, returns defaultValue for invalid values */
function parseGratkaNumber(value: string | undefined | null, defaultValue: null): number | null;
function parseGratkaNumber(value: string | undefined | null, defaultValue: number): number;
function parseGratkaNumber(value: string | undefined | null, defaultValue: number | null): number | null {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

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
    baseParams.searchParameters.priceM2From = formatGratkaDecimal(params.pricePerMeterMin);
  }
  if (params.pricePerMeterMax !== undefined) {
    baseParams.searchParameters.priceM2To = formatGratkaDecimal(params.pricePerMeterMax);
  }

  // Building materials filter (convert to Gratka dictionaries format)
  if (params.buildingMaterial && params.buildingMaterial.length > 0) {
    const dictionaries = toGratkaBuildingMaterials(params.buildingMaterial);
    if (dictionaries.length > 0) {
      baseParams.searchParameters.dictionaries = dictionaries;
    }
  }

  // Extras/amenities filter (convert to Gratka attributes format)
  if (params.extras && params.extras.length > 0) {
    const attributes = toGratkaAttributes(params.extras);
    if (Object.keys(attributes).length > 0) {
      baseParams.searchParameters.attributes = {
        ...baseParams.searchParameters.attributes,
        ...attributes,
      };
    }
    
    // Handle HAS_PHOTOS special case
    if (params.extras.includes('HAS_PHOTOS')) {
      baseParams.searchParameters.withPhoto = true;
    }
  }

  // Listing age filter (convert days to dateFrom)
  if (params.daysSinceCreated) {
    const days = typeof params.daysSinceCreated === 'string' ? Number(params.daysSinceCreated) : params.daysSinceCreated;
    baseParams.searchParameters.dateFrom = toGratkaDateFrom(days);
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
 * Convert Gratka property to unified format
 *
 * @param property - The Gratka property node to convert
 * @param options - Optional overrides for coordinates and inferred types
 */
export function toUnifiedProperty(
  property: GratkaPropertyNode,
  options?: {
    /** Fallback latitude if property has no coordinates */
    fallbackLat?: number;
    /** Fallback longitude if property has no coordinates */
    fallbackLng?: number;
    /** Override estate type (useful when API doesn't return it) */
    estateType?: UnifiedEstateType;
    /** Override transaction type (useful when API doesn't return it) */
    transaction?: UnifiedTransactionType;
  }
): UnifiedProperty {
  // Parse price from Gratka format - API uses 'amount' field
  const totalPrice = property.price 
    ? parseGratkaNumber(property.price.amount ?? property.price.totalPrice, null)
    : null;
  // Price per meter comes from priceM2.amount or fallback to pricePerSquareMeter
  const pricePerMeter = property.priceM2?.amount 
    ? parseGratkaNumber(property.priceM2.amount, null)
    : (property.price?.pricePerSquareMeter ? parseGratkaNumber(property.price.pricePerSquareMeter, null) : null);
  const area = parseGratkaNumber(property.area, 0);

  // Parse rooms (Gratka uses number or string)
  const rooms = property.rooms ?? (property.numberOfRooms ? parseInt(property.numberOfRooms, 10) : null);

  // Parse floor from formatted string
  const floor = parseFloorFromFormatted(property.floorFormatted);

  // Get coordinates - location may not have coordinates in listing response
  // Use fallback coordinates if provided and property has no coordinates
  const lat = property.location?.coordinates?.latitude 
    ?? property.location?.map?.center.latitude 
    ?? options?.fallbackLat 
    ?? 0;
  const lng = property.location?.coordinates?.longitude 
    ?? property.location?.map?.center.longitude 
    ?? options?.fallbackLng 
    ?? 0;

  // Map images - Gratka uses thumbs.cdngr.pl with base64 photo.id
  const images = (property.photos ?? []).map((photo) => ({
    medium: `${GRATKA_CDN_URL}/thumb/${photo.id}/3x2_m:fill_and_crop/${photo.name}.jpg`,
    large: `${GRATKA_CDN_URL}/thumb/${photo.id}/16x9_xl:fill_and_crop/${photo.name}.jpg`,
  }));

  return {
    id: createUnifiedId('gratka', property.id),
    sourceId: property.id,
    source: 'gratka',
    lat,
    lng,
    title: property.title,
    url: property.url.startsWith('http') ? property.url : `${GRATKA_BASE_URL}${property.url}`,
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
    // Use override types if provided, otherwise try to get from property, fallback to defaults
    estateType: options?.estateType 
      ?? (property.propertyType ? mapGratkaPropertyType(property.propertyType) : 'FLAT'),
    transaction: options?.transaction 
      ?? (property.transaction ? mapGratkaTransaction(property.transaction) : 'SELL'),
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

// ============================================================================
// Gratka Adapter
// ============================================================================

/**
 * Fetch map markers for multiple property types in parallel
 * 
 * Gratka API doesn't support multiple property types in a single searchMap call
 * ("Mixing root types is forbidden" error). This helper makes separate calls
 * for each type and combines the results.
 */
async function fetchMarkersForPropertyTypes(
  gratkaParams: GratkaListingParametersInput,
  signal?: AbortSignal
): Promise<GratkaMapMarker[]> {
  const propertyTypes = gratkaParams.searchParameters.type ?? ['FLAT'];
  
  const markerPromises = propertyTypes.map(async (propType) => {
    const singleTypeParams = {
      ...gratkaParams,
      searchParameters: {
        ...gratkaParams.searchParameters,
        type: [propType],
      },
      isMapMode: true,
    };
    
    const result = await gratkaClient.searchMap(singleTypeParams, {
      numberOfMarkers: Math.ceil(GRATKA_DEFAULT_MAX_MARKERS / propertyTypes.length),
      propertyIds: [],
    }, signal);
    
    return result.markers;
  });
  
  const markerResults = await Promise.all(markerPromises);
  return markerResults.flat();
}

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

  async searchProperties(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const gratkaParams = toGratkaParams(params);

    // Fetch markers for all property types
    const allMarkers = await fetchMarkersForPropertyTypes(gratkaParams, params.signal);

    // Separate clustered and non-clustered markers
    const nonClusteredMarkers = allMarkers.filter(m => !m.clustered && m.count === 1 && m.ids && m.ids.length > 0);
    const clusteredMarkers = allMarkers.filter(m => m.clustered || m.count > 1);

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

    // Fetch full property details for non-clustered markers using getMarkers API
    let properties: UnifiedProperty[] = [];
    if (propertyIds.length > 0) {
      const markersData = await gratkaClient.getMarkers(propertyIds, params.signal);

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

    return {
      properties,
      clusters,
      totalCount: properties.length + clusters.reduce((sum, c) => sum + c.count, 0),
      cached: false, // Gratka doesn't indicate cache status
      fetchedAt: new Date().toISOString(),
      sources: ['gratka'],
    };
  }

  async searchMapMarkers(params: UnifiedSearchParams): Promise<UnifiedCluster[]> {
    const gratkaParams = toGratkaParams(params);
    gratkaParams.isMapMode = true;

    const allMarkers = await fetchMarkersForPropertyTypes(gratkaParams, params.signal);
    return allMarkers.map(toUnifiedCluster);
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
