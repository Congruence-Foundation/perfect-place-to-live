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
import type {
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedCluster,
  UnifiedProperty,
  UnifiedEstateType,
  UnifiedOwnerType,
} from '../shared/types';
import { createUnifiedId } from '../shared/types';
import { fetchOtodomProperties } from './client';

// ============================================================================
// Otodom-Specific Conversion Utilities
// ============================================================================

/**
 * Map unified owner type to Otodom format
 * Note: Otodom doesn't support COMMUNE, falls back to ALL
 */
function toOtodomOwnerType(owner: UnifiedOwnerType): 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY' {
  if (owner === 'COMMUNE') return 'ALL';
  return owner as 'ALL' | 'PRIVATE' | 'DEVELOPER' | 'AGENCY';
}

/**
 * Bidirectional room count mapping between numbers and Otodom string enums.
 * Single source of truth for room count conversions.
 */
const ROOM_COUNT_MAP: readonly [number, OtodomRoomCount][] = [
  [1, 'ONE'],
  [2, 'TWO'],
  [3, 'THREE'],
  [4, 'FOUR'],
  [5, 'FIVE'],
  [6, 'SIX'],
  [7, 'SEVEN'],
  [8, 'EIGHT'],
  [9, 'NINE'],
  [10, 'TEN'],
  [11, 'MORE'],
] as const;

const numberToRoom = new Map(ROOM_COUNT_MAP);
const roomToNumber = new Map(ROOM_COUNT_MAP.map(([n, r]) => [r, n]));

/**
 * Map room count number to Otodom string enum
 */
function toOtodomRoomCount(room: number): OtodomRoomCount {
  return numberToRoom.get(room) ?? 'MORE';
}

/**
 * Map Otodom room string to number
 */
export function fromOtodomRoomCount(room: string): number {
  return roomToNumber.get(room as OtodomRoomCount) ?? 0;
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
  // UnifiedEstateType and OtodomEstateType share the same values
  const estateTypes = params.propertyTypes as OtodomEstateType[];

  const roomsNumber = params.rooms?.map(toOtodomRoomCount) as OtodomPropertyFilters['roomsNumber'];

  // Handle optional daysSinceCreated from extended params
  const extendedParams = params as UnifiedSearchParams & { daysSinceCreated?: number };

  return {
    transaction: params.transaction as 'SELL' | 'RENT',
    estate: estateTypes,
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    areaMin: params.areaMin,
    areaMax: params.areaMax,
    roomsNumber,
    market: params.market ?? 'ALL',
    ownerType: params.owner ? toOtodomOwnerType(params.owner) : 'ALL',
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
export function toUnifiedProperty(property: OtodomProperty): UnifiedProperty {
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
    estateType: property.estate,
    transaction: property.transaction,
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
    estateType: cluster.estateType as UnifiedEstateType | undefined,
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
