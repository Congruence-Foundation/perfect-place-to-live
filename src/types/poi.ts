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
