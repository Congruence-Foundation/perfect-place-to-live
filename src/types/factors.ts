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

export interface FactorConfig {
  factors: Factor[];
  mode: 'realtime' | 'precomputed';
  gridSize: number;
}
