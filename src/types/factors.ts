export interface Factor {
  id: string;
  name: string;
  osmTags: string[];
  weight: number;        // -100 to +100 (sign determines polarity: negative = avoid, positive = prefer)
  enabled: boolean;
  maxDistance: number;
  icon: string;
  category: 'essential' | 'lifestyle' | 'environment';
  defaultWeight: number; // Store original default for reset
}

/**
 * Minimal factor definition for POI fetching
 * Used when only id and osmTags are needed
 */
export interface FactorDef {
  id: string;
  osmTags: string[];
}
