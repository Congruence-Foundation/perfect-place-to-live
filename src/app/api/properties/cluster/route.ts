import { NextRequest, NextResponse } from 'next/server';
import { fetchClusterProperties, fromOtodomRoomCount } from '@/extensions/real-estate/lib/otodom';
import { fetchGratkaClusterProperties } from '@/extensions/real-estate/lib/gratka';
import { PropertyFilters, DEFAULT_PROPERTY_FILTERS } from '@/extensions/real-estate/types';
import type { PropertyDataSource } from '@/extensions/real-estate/config';
import type { UnifiedProperty } from '@/extensions/real-estate/lib/shared';
import { createUnifiedId } from '@/extensions/real-estate/lib/shared';
import { errorResponse, handleApiError } from '@/lib/api-utils';
import { CLUSTER_CONFIG } from '@/constants/performance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClusterRequest {
  lat: number;
  lng: number;
  filters?: Partial<PropertyFilters>;
  page?: number;
  limit?: number;
  shape?: string; // GeoJSON polygon string (preferred for Otodom)
  radius?: number; // Fallback radius in meters
  estateType?: string; // Specific estate type for this cluster
  /** Data source to fetch from (defaults to 'otodom') */
  source?: PropertyDataSource;
  /** Cluster URL for Gratka (more efficient than bounds) */
  clusterUrl?: string;
  /** Cluster bounds for Gratka */
  clusterBounds?: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
}

/**
 * Convert Otodom property to unified format
 */
function otodomToUnified(property: {
  id: number;
  lat: number;
  lng: number;
  title: string;
  url: string;
  totalPrice: { value: number; currency: string };
  pricePerMeter?: { value: number; currency: string };
  areaInSquareMeters: number;
  roomsNumber?: string;
  floor?: number;
  buildYear?: number;
  images: { medium: string; large: string }[];
  isPromoted: boolean;
  createdAt: string;
  estate: string;
  transaction: string;
  hidePrice?: boolean;
}): UnifiedProperty {
  // Parse room count from string enum (e.g., 'ONE', 'TWO', 'THREE', etc.)
  const rooms = property.roomsNumber ? fromOtodomRoomCount(property.roomsNumber) : null;

  return {
    id: createUnifiedId('otodom', property.id),
    sourceId: property.id,
    source: 'otodom',
    lat: property.lat,
    lng: property.lng,
    title: property.title,
    url: property.url,
    price: property.hidePrice ? null : property.totalPrice.value,
    pricePerMeter: property.pricePerMeter?.value ?? null,
    currency: property.totalPrice.currency,
    area: property.areaInSquareMeters,
    rooms,
    floor: property.floor ?? null,
    buildYear: property.buildYear ?? null,
    images: property.images,
    isPromoted: property.isPromoted,
    createdAt: property.createdAt,
    estateType: property.estate as UnifiedProperty['estateType'],
    transaction: property.transaction as UnifiedProperty['transaction'],
    rawData: property,
  };
}

/**
 * POST /api/properties/cluster
 * Fetch individual properties within a cluster area
 */
export async function POST(request: NextRequest) {
  try {
    const body: ClusterRequest = await request.json();
    const { 
      lat, 
      lng, 
      filters: partialFilters, 
      page = CLUSTER_CONFIG.DEFAULT_PAGE, 
      limit = CLUSTER_CONFIG.DEFAULT_LIMIT, 
      shape, 
      radius = CLUSTER_CONFIG.DEFAULT_RADIUS_METERS, 
      estateType,
      source = 'otodom',
      clusterUrl,
      clusterBounds,
    } = body;

    // Validate required fields
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return errorResponse(new Error('Invalid coordinates: lat and lng are required'), 400);
    }

    // Merge with default filters
    const filters: PropertyFilters = {
      ...DEFAULT_PROPERTY_FILTERS,
      ...partialFilters,
    };

    let result: {
      properties: UnifiedProperty[];
      totalCount: number;
      currentPage: number;
      totalPages: number;
    };

    if (source === 'gratka') {
      // Use Gratka client
      // Convert roomsNumber string array to number array for Gratka
      const rooms = filters.roomsNumber?.map(fromOtodomRoomCount);
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cluster/route.ts:gratka-request',message:'Gratka cluster request',data:{lat,lng,hasClusterUrl:!!clusterUrl,clusterUrl:clusterUrl?.slice(0,100),hasBounds:!!clusterBounds,radius,page,limit},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'1'})}).catch(()=>{});
      // #endregion
      
      const gratkaResult = await fetchGratkaClusterProperties({
        clusterUrl,
        lat,
        lng,
        clusterBounds,
        radiusMeters: radius,
        transaction: filters.transaction === 'SELL' ? 'SALE' : 'RENT',
        propertyType: estateType ? [estateType === 'TERRAIN' ? 'PLOT' : estateType as 'FLAT' | 'HOUSE'] : undefined,
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        areaMin: filters.areaMin,
        areaMax: filters.areaMax,
        rooms,
        page,
        pageSize: limit,
      });

      // Gratka adapter already returns unified-like format, but we need to ensure consistency
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cluster/route.ts:gratka',message:'Raw gratka properties',data:{count:gratkaResult.properties.length,firstProperty:gratkaResult.properties[0]?{id:gratkaResult.properties[0].id,price:gratkaResult.properties[0].price,priceM2:gratkaResult.properties[0].priceM2,photos:gratkaResult.properties[0].photos,location:gratkaResult.properties[0].location}:null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      
      // Infer estateType and transaction from filters since Gratka API doesn't return these fields
      const inferredEstateType = estateType ?? 'FLAT';
      const inferredTransaction = filters.transaction ?? 'SELL';
      
      result = {
        properties: gratkaResult.properties.map(p => ({
          id: createUnifiedId('gratka', p.id),
          sourceId: p.id,
          source: 'gratka' as const,
          // Use property coordinates if available, otherwise fall back to cluster center
          // Gratka cluster listings often don't include coordinates, but the cluster center
          // is a reasonable approximation for price analysis (all properties are nearby)
          lat: p.location?.coordinates?.latitude ?? p.location?.map?.center.latitude ?? lat,
          lng: p.location?.coordinates?.longitude ?? p.location?.map?.center.longitude ?? lng,
          title: p.title,
          url: p.url.startsWith('http') ? p.url : `https://gratka.pl${p.url}`,
          price: p.price?.amount ? parseFloat(p.price.amount) : null,
          pricePerMeter: p.priceM2?.amount ? parseFloat(p.priceM2.amount) : null,
          currency: p.price?.currency ?? 'PLN',
          area: p.area ? parseFloat(p.area) : 0,
          rooms: p.rooms ?? (p.numberOfRooms ? parseInt(p.numberOfRooms, 10) : null),
          floor: null, // Would need parsing from floorFormatted
          buildYear: null,
          images: (p.photos ?? []).map(photo => ({
            medium: `https://thumbs.cdngr.pl/thumb/${photo.id}/3x2_m:fill_and_crop/${photo.name}.jpg`,
            large: `https://thumbs.cdngr.pl/thumb/${photo.id}/16x9_xl:fill_and_crop/${photo.name}.jpg`,
          })),
          isPromoted: p.isHighlighted ?? p.isPromoted ?? false,
          createdAt: p.addedAt,
          // Use inferred values from search filters since Gratka API doesn't return propertyType/transaction
          estateType: inferredEstateType as UnifiedProperty['estateType'],
          transaction: inferredTransaction as UnifiedProperty['transaction'],
          rawData: p,
        })),
        totalCount: gratkaResult.totalCount,
        currentPage: gratkaResult.currentPage,
        totalPages: gratkaResult.totalPages,
      };
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cluster/route.ts:gratka-result',message:'Converted properties',data:{count:result.properties.length,clusterCenter:{lat,lng},firstProperty:result.properties[0]?{id:result.properties[0].id,price:result.properties[0].price,pricePerMeter:result.properties[0].pricePerMeter,estateType:result.properties[0].estateType,transaction:result.properties[0].transaction,images:result.properties[0].images,lat:result.properties[0].lat,lng:result.properties[0].lng,usedClusterCenter:result.properties[0].lat===lat&&result.properties[0].lng===lng}:null,rawPropertyType:gratkaResult.properties[0]?.propertyType,rawTransaction:gratkaResult.properties[0]?.transaction},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    } else {
      // Use Otodom client (default)
      const otodomResult = await fetchClusterProperties(
        lat,
        lng,
        filters,
        page,
        limit,
        shape,
        radius,
        estateType
      );

      result = {
        properties: otodomResult.properties.map(otodomToUnified),
        totalCount: otodomResult.totalCount,
        currentPage: otodomResult.currentPage,
        totalPages: otodomResult.totalPages,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/87870a9f-2e18-4c88-a39f-243879bf5747',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'cluster/route.ts:error',message:'Cluster API error',data:{error:error instanceof Error?{message:error.message,stack:error.stack?.slice(0,500)}:String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ERROR'})}).catch(()=>{});
    // #endregion
    return handleApiError(error, { context: 'Cluster properties API' });
  }
}
