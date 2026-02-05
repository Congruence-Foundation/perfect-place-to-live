/**
 * Otodom Data Source Adapter
 *
 * Implements IPropertyDataSource interface for Otodom API.
 * Contains all Otodom-specific conversion utilities.
 */

import type { PropertyDataSource } from '../../config/filters';
import type {
  OtodomProperty,
  OtodomPropertyCluster,
  OtodomPropertyFilters,
  OtodomEstateType,
  OtodomRoomCount,
} from './types';
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
  UnifiedEstateType,
  UnifiedTransactionType,
  UnifiedOwnerType,
  UnifiedSortKey,
} from '../shared/types';
import { createUnifiedId, parseUnifiedId } from '../shared/types';
import { fetchOtodomProperties } from './client';

// ============================================================================
// Otodom-Specific Conversion Utilities
// ============================================================================

/**
 * Map Otodom transaction type to unified
 * Otodom uses 'SELL' | 'RENT' which matches unified format
 */
export function mapOtodomTransaction(transaction: 'SELL' | 'RENT'): UnifiedTransactionType {
  return transaction;
}

/**
 * Map Otodom estate type to unified
 * Otodom uses same format as unified
 */
export function mapOtodomEstateType(
  estate: 'FLAT' | 'HOUSE' | 'TERRAIN' | 'COMMERCIAL' | 'ROOM' | 'GARAGE'
): UnifiedEstateType {
  return estate;
}

/**
 * Map unified owner type to Otodom format
 * Note: Otodom doesn't support COMMUNE, falls back to ALL
 */
export function toOtodomOwnerType(owner: UnifiedOwnerType): 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY' {
  if (owner === 'COMMUNE') return 'ALL';
  return owner as 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY';
}

/**
 * Map unified sort key to Otodom format
 * Note: Otodom has limited sort options
 */
export function toOtodomSortKey(sort: UnifiedSortKey): { by: string; direction: 'ASC' | 'DESC' } {
  switch (sort) {
    case 'RELEVANCE':
      return { by: 'DEFAULT', direction: 'DESC' };
    case 'PRICE_ASC':
      return { by: 'PRICE', direction: 'ASC' };
    case 'PRICE_DESC':
      return { by: 'PRICE', direction: 'DESC' };
    case 'PRICE_M2_ASC':
    case 'PRICE_M2_DESC':
      // Otodom doesn't support price per m² sorting, fall back to price
      return { by: 'PRICE', direction: sort.endsWith('ASC') ? 'ASC' : 'DESC' };
    case 'AREA_ASC':
      return { by: 'AREA', direction: 'ASC' };
    case 'AREA_DESC':
      return { by: 'AREA', direction: 'DESC' };
    case 'DATE_ASC':
    case 'DATE_DESC':
      return { by: 'CREATED_AT', direction: sort.endsWith('ASC') ? 'ASC' : 'DESC' };
    default:
      return { by: 'DEFAULT', direction: 'DESC' };
  }
}

/**
 * Map room count number to Otodom string enum
 */
export function toOtodomRoomCount(room: number): OtodomRoomCount {
  const roomMap: Record<number, OtodomRoomCount> = {
    1: 'ONE',
    2: 'TWO',
    3: 'THREE',
    4: 'FOUR',
    5: 'FIVE',
    6: 'SIX',
    7: 'SEVEN',
    8: 'EIGHT',
    9: 'NINE',
    10: 'TEN',
  };
  return roomMap[room] || 'MORE';
}

/**
 * Map Otodom room string to number
 */
export function fromOtodomRoomCount(room: string): number {
  const roomMap: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    SIX: 6,
    SEVEN: 7,
    EIGHT: 8,
    NINE: 9,
    TEN: 10,
    MORE: 11,
  };
  return roomMap[room] || 0;
}

// ============================================================================
// Internal Conversion Functions
// ============================================================================

/**
 * Convert days since created number to Otodom string format
 */
function toOtodomDaysSinceCreated(days: number | undefined): '1' | '3' | '7' | '14' | '30' | '90' | undefined {
  if (days === undefined) return undefined;
  // Map to closest valid Otodom value
  const validValues = [1, 3, 7, 14, 30, 90] as const;
  // Find the smallest valid value that is >= days, or the largest if days exceeds all
  const closest = validValues.find(v => v >= days) ?? 90;
  return String(closest) as '1' | '3' | '7' | '14' | '30' | '90';
}

/**
 * Convert unified search params to Otodom PropertyFilters
 */
function toOtodomFilters(params: UnifiedSearchParams): OtodomPropertyFilters {
  // Map unified estate types to Otodom format
  const estateTypes = params.propertyTypes.map((type: UnifiedEstateType) => {
    return type as OtodomEstateType;
  });

  // Map room numbers to Otodom string enum
  const roomsNumber = params.rooms?.map(toOtodomRoomCount) as OtodomPropertyFilters['roomsNumber'];

  // Map market type
  const market = params.market ?? 'ALL';

  // Map owner type (handles COMMUNE -> ALL fallback)
  const owner = params.owner ? toOtodomOwnerType(params.owner) : 'ALL';

  // Handle listing age filter (daysSinceCreated)
  // Note: This requires extending UnifiedSearchParams to include daysSinceCreated
  const extendedParams = params as UnifiedSearchParams & { daysSinceCreated?: number };

  return {
    transaction: params.transaction as 'SELL' | 'RENT',
    estate: estateTypes,
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    areaMin: params.areaMin,
    areaMax: params.areaMax,
    roomsNumber: roomsNumber,
    market: market,
    ownerType: owner,
    pricePerMeterMin: params.pricePerMeterMin,
    pricePerMeterMax: params.pricePerMeterMax,
    buildYearMin: params.buildYearMin,
    buildYearMax: params.buildYearMax,
    daysSinceCreated: toOtodomDaysSinceCreated(extendedParams.daysSinceCreated),
  };
}

/**
 * Convert Otodom property to unified format
 */
function toUnifiedProperty(property: OtodomProperty): UnifiedProperty {
  // Parse room count from string
  const rooms = property.roomsNumber ? fromOtodomRoomCount(property.roomsNumber) : null;

  // Calculate price per meter if not available
  const pricePerMeter =
    property.pricePerMeter?.value ??
    (property.totalPrice?.value && property.areaInSquareMeters
      ? Math.round(property.totalPrice.value / property.areaInSquareMeters)
      : null);

  return {
    id: createUnifiedId('otodom', property.id),
    sourceId: property.id,
    source: 'otodom',
    lat: property.lat,
    lng: property.lng,
    title: property.title,
    url: property.url,
    price: property.hidePrice ? null : (property.totalPrice?.value ?? null),
    pricePerMeter: property.hidePrice ? null : pricePerMeter,
    currency: property.totalPrice?.currency ?? 'PLN',
    area: property.areaInSquareMeters,
    rooms,
    floor: property.floor ?? null,
    buildYear: property.buildYear ?? null,
    images: (property.images ?? []).map((img) => ({
      medium: img.medium,
      large: img.large,
    })),
    isPromoted: property.isPromoted,
    createdAt: property.createdAt,
    estateType: mapOtodomEstateType(property.estate) as UnifiedEstateType,
    transaction: mapOtodomTransaction(property.transaction) as UnifiedTransactionType,
    rawData: property,
  };
}

/**
 * Convert Otodom cluster to unified format
 */
function toUnifiedCluster(cluster: OtodomPropertyCluster): UnifiedCluster {
  return {
    lat: cluster.lat,
    lng: cluster.lng,
    count: cluster.count,
    source: 'otodom',
    shape: cluster.shape,
    radiusInMeters: cluster.radiusInMeters,
    estateType: cluster.estateType
      ? (mapOtodomEstateType(cluster.estateType as OtodomProperty['estate']) as UnifiedEstateType)
      : undefined,
  };
}

// ============================================================================
// Otodom Adapter
// ============================================================================

/**
 * Otodom data source adapter
 *
 * Implements IPropertyDataSource interface for Otodom API.
 */
export class OtodomAdapter implements IPropertyDataSource {
  readonly name: PropertyDataSource = 'otodom';
  readonly displayName = 'Otodom';

  // Features supported by Otodom
  private readonly supportedFeatures: Set<DataSourceFeature> = new Set([
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
    const filters = toOtodomFilters(params);

    const response = await fetchOtodomProperties(params.bounds, filters, params.signal);

    return {
      properties: response.properties.map(toUnifiedProperty),
      clusters: response.clusters.map(toUnifiedCluster),
      totalCount: response.totalCount,
      cached: response.cached,
      fetchedAt: response.fetchedAt,
      sources: ['otodom'],
    };
  }

  async searchMapMarkers(params: UnifiedSearchParams): Promise<UnifiedCluster[]> {
    // Otodom returns clusters as part of searchProperties
    const result = await this.searchProperties(params);
    return result.clusters;
  }

  supportsFeature(feature: DataSourceFeature): boolean {
    return this.supportedFeatures.has(feature);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: OtodomAdapter | null = null;

/**
 * Get the singleton Otodom adapter instance
 */
export function getOtodomAdapter(): OtodomAdapter {
  if (!instance) {
    instance = new OtodomAdapter();
  }
  return instance;
}

// Re-export shared utilities that are used by both adapters
export { createUnifiedId, parseUnifiedId };
