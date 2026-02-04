export interface Point {
  lat: number;
  lng: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface POI {
  id: number;
  lat: number;
  lng: number;
  tags: Record<string, string>;
  name?: string;
}

/**
 * Data source for POI fetching
 * - neon: PostgreSQL database (fast, pre-cached)
 * - overpass: Overpass API (real-time, slower)
 */
export type POIDataSource = 'neon' | 'overpass';
