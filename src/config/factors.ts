import { Factor } from '@/types/factors';
import { POI_CATEGORIES, POICategory, getOsmTags } from './poi-categories';

// Profile type definition
export interface FactorProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  // Factor overrides: factorId -> { weight, maxDistance, enabled }
  overrides: Record<string, { weight?: number; maxDistance?: number; enabled?: boolean }>;
}

// Available profiles
export const FACTOR_PROFILES: FactorProfile[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Well-rounded for general living',
    icon: 'scale',
    overrides: {
      grocery: { weight: 80, enabled: true },
      transit: { weight: 70, enabled: true },
      healthcare: { weight: 65, enabled: true },
      parks: { weight: 60, enabled: true },
      schools: { weight: 50, enabled: true },
      post: { weight: 40, enabled: true },
      restaurants: { weight: 35, enabled: false },
      banks: { weight: 30, enabled: false },
      gyms: { weight: 25, enabled: false },
      playgrounds: { weight: 30, enabled: false },
      stadiums: { weight: 0, enabled: false },
      nightlife: { weight: 0, enabled: false },
      universities: { weight: 0, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 0, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 0, enabled: false },
      markets: { weight: 30, enabled: false },
      water: { weight: 40, enabled: false },
      industrial: { weight: -40, enabled: true },
      highways: { weight: -30, enabled: true },
      airports: { weight: -40, enabled: false },
      railways: { weight: -30, enabled: false },
      cemeteries: { weight: -20, enabled: false },
      construction: { weight: -30, enabled: false },
    },
  },
  {
    id: 'family',
    name: 'Family',
    description: 'Schools, parks, playgrounds, quiet areas',
    icon: 'users',
    overrides: {
      grocery: { weight: 85, maxDistance: 1500, enabled: true },
      transit: { weight: 50, enabled: true },
      healthcare: { weight: 90, maxDistance: 2000, enabled: true },
      parks: { weight: 95, maxDistance: 800, enabled: true },
      schools: { weight: 100, maxDistance: 1000, enabled: true },
      post: { weight: 30, enabled: true },
      restaurants: { weight: 20, enabled: false },
      banks: { weight: 25, enabled: false },
      gyms: { weight: 30, enabled: false },
      playgrounds: { weight: 95, maxDistance: 500, enabled: true },
      stadiums: { weight: -30, maxDistance: 2000, enabled: true }, // Noise, crowds
      nightlife: { weight: -60, maxDistance: 1000, enabled: true }, // Noise, not family-friendly
      universities: { weight: 0, enabled: false },
      religious: { weight: 40, enabled: false },
      dog_parks: { weight: 50, maxDistance: 1000, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 30, enabled: false },
      markets: { weight: 40, enabled: false },
      water: { weight: 50, maxDistance: 1500, enabled: true },
      industrial: { weight: -80, maxDistance: 1500, enabled: true },
      highways: { weight: -70, maxDistance: 800, enabled: true },
      airports: { weight: -60, maxDistance: 3000, enabled: true },
      railways: { weight: -50, maxDistance: 600, enabled: true },
      cemeteries: { weight: -30, enabled: false },
      construction: { weight: -50, maxDistance: 500, enabled: true },
    },
  },
  {
    id: 'young-professional',
    name: 'Urban Pro',
    description: 'Transit, nightlife, gyms, urban living',
    icon: 'briefcase',
    overrides: {
      grocery: { weight: 70, maxDistance: 1000, enabled: true },
      transit: { weight: 100, maxDistance: 800, enabled: true },
      healthcare: { weight: 40, enabled: true },
      parks: { weight: 50, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 50, maxDistance: 1500, enabled: true },
      restaurants: { weight: 85, maxDistance: 800, enabled: true },
      banks: { weight: 60, maxDistance: 1500, enabled: true },
      gyms: { weight: 80, maxDistance: 1500, enabled: true },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: 40, maxDistance: 2000, enabled: true }, // Events, social
      nightlife: { weight: 70, maxDistance: 1000, enabled: true }, // Social life
      universities: { weight: 30, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 0, enabled: false },
      coworking: { weight: 50, maxDistance: 1500, enabled: true },
      cinemas: { weight: 50, maxDistance: 2000, enabled: true },
      markets: { weight: 40, enabled: false },
      water: { weight: 30, enabled: false },
      industrial: { weight: -30, enabled: true },
      highways: { weight: -20, enabled: true },
      airports: { weight: -30, enabled: false },
      railways: { weight: -20, enabled: false },
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -20, enabled: false },
    },
  },
  {
    id: 'remote-worker',
    name: 'Remote Worker',
    description: 'Quiet, parks, cafes, less transit focus',
    icon: 'laptop',
    overrides: {
      grocery: { weight: 85, maxDistance: 2000, enabled: true },
      transit: { weight: 40, maxDistance: 2000, enabled: true },
      healthcare: { weight: 60, enabled: true },
      parks: { weight: 90, maxDistance: 1000, enabled: true },
      schools: { weight: -20, enabled: true }, // Daytime noise
      post: { weight: 70, maxDistance: 1500, enabled: true },
      restaurants: { weight: 75, maxDistance: 1500, enabled: true },
      banks: { weight: 40, enabled: true },
      gyms: { weight: 50, enabled: true },
      playgrounds: { weight: -20, maxDistance: 500, enabled: true }, // Daytime noise
      stadiums: { weight: -40, maxDistance: 2000, enabled: true }, // Event noise
      nightlife: { weight: -30, maxDistance: 800, enabled: true }, // Night noise
      universities: { weight: 30, enabled: false }, // Cafes nearby
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 40, enabled: false },
      coworking: { weight: 80, maxDistance: 1500, enabled: true },
      cinemas: { weight: 20, enabled: false },
      markets: { weight: 30, enabled: false },
      water: { weight: 60, maxDistance: 1500, enabled: true }, // Peaceful views
      industrial: { weight: -70, maxDistance: 1500, enabled: true },
      highways: { weight: -60, maxDistance: 600, enabled: true },
      airports: { weight: -50, maxDistance: 3000, enabled: true },
      railways: { weight: -40, maxDistance: 500, enabled: true },
      cemeteries: { weight: 20, enabled: false }, // Quiet!
      construction: { weight: -60, maxDistance: 500, enabled: true },
    },
  },
  {
    id: 'active-lifestyle',
    name: 'Active Lifestyle',
    description: 'Gyms, parks, sports facilities',
    icon: 'activity',
    overrides: {
      grocery: { weight: 70, enabled: true },
      transit: { weight: 60, enabled: true },
      healthcare: { weight: 50, enabled: true },
      parks: { weight: 100, maxDistance: 500, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 30, enabled: true },
      restaurants: { weight: 50, enabled: true },
      banks: { weight: 25, enabled: false },
      gyms: { weight: 100, maxDistance: 1000, enabled: true },
      playgrounds: { weight: 20, enabled: false },
      stadiums: { weight: 80, maxDistance: 2000, enabled: true }, // Sports events!
      nightlife: { weight: 30, enabled: false },
      universities: { weight: 0, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 60, maxDistance: 1000, enabled: true },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 20, enabled: false },
      markets: { weight: 30, enabled: false },
      water: { weight: 70, maxDistance: 1500, enabled: true }, // Running, swimming
      industrial: { weight: -50, enabled: true },
      highways: { weight: -40, enabled: true },
      airports: { weight: -30, enabled: false },
      railways: { weight: -20, enabled: false },
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -30, enabled: false },
    },
  },
  {
    id: 'student',
    name: 'Student',
    description: 'Universities, transit, affordable food, nightlife',
    icon: 'graduation-cap',
    overrides: {
      grocery: { weight: 85, maxDistance: 1000, enabled: true },
      transit: { weight: 95, maxDistance: 800, enabled: true },
      healthcare: { weight: 40, enabled: true },
      parks: { weight: 50, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 40, enabled: true },
      restaurants: { weight: 70, maxDistance: 1000, enabled: true }, // Affordable food options
      banks: { weight: 50, maxDistance: 1500, enabled: true },
      gyms: { weight: 60, maxDistance: 1500, enabled: true },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: 40, enabled: false },
      nightlife: { weight: 80, maxDistance: 1500, enabled: true }, // Social life
      universities: { weight: 100, maxDistance: 2000, enabled: true }, // Primary focus
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 0, enabled: false },
      coworking: { weight: 70, maxDistance: 1500, enabled: true }, // Study spaces
      cinemas: { weight: 40, maxDistance: 2000, enabled: true },
      markets: { weight: 30, enabled: false },
      water: { weight: 20, enabled: false },
      industrial: { weight: -30, enabled: true },
      highways: { weight: -20, enabled: true },
      airports: { weight: -20, enabled: false },
      railways: { weight: -15, enabled: false },
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -20, enabled: false },
    },
  },
  {
    id: 'established',
    name: 'Settled',
    description: 'Quality dining, culture, quiet residential',
    icon: 'gem',
    overrides: {
      grocery: { weight: 80, maxDistance: 2000, enabled: true },
      transit: { weight: 50, enabled: true },
      healthcare: { weight: 75, maxDistance: 2500, enabled: true },
      parks: { weight: 80, maxDistance: 1000, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 50, enabled: true },
      restaurants: { weight: 85, maxDistance: 1500, enabled: true }, // Quality dining
      banks: { weight: 50, enabled: true },
      gyms: { weight: 60, maxDistance: 2000, enabled: true },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: -20, maxDistance: 2000, enabled: true }, // Prefer quiet
      nightlife: { weight: -40, maxDistance: 1000, enabled: true }, // Avoid noise
      universities: { weight: 0, enabled: false },
      religious: { weight: 30, enabled: false },
      dog_parks: { weight: 40, enabled: false },
      coworking: { weight: 30, enabled: false },
      cinemas: { weight: 50, maxDistance: 2500, enabled: true }, // Cultural venues
      markets: { weight: 60, maxDistance: 2000, enabled: true }, // Quality markets
      water: { weight: 70, maxDistance: 2000, enabled: true }, // Scenic views
      industrial: { weight: -70, maxDistance: 1500, enabled: true },
      highways: { weight: -60, maxDistance: 800, enabled: true },
      airports: { weight: -50, maxDistance: 3000, enabled: true },
      railways: { weight: -40, maxDistance: 600, enabled: true },
      cemeteries: { weight: -20, enabled: false },
      construction: { weight: -50, maxDistance: 600, enabled: true },
    },
  },
  {
    id: 'senior',
    name: 'Senior',
    description: 'Healthcare, quiet, accessible services',
    icon: 'heart',
    overrides: {
      grocery: { weight: 95, maxDistance: 1000, enabled: true },
      transit: { weight: 80, maxDistance: 800, enabled: true },
      healthcare: { weight: 100, maxDistance: 1500, enabled: true },
      parks: { weight: 85, maxDistance: 800, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 70, maxDistance: 1000, enabled: true },
      restaurants: { weight: 40, enabled: true },
      banks: { weight: 60, maxDistance: 1500, enabled: true },
      gyms: { weight: 30, enabled: false },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: -50, maxDistance: 2000, enabled: true }, // Noise, crowds
      nightlife: { weight: -70, maxDistance: 1000, enabled: true }, // Noise
      universities: { weight: 0, enabled: false },
      religious: { weight: 50, maxDistance: 1500, enabled: false },
      dog_parks: { weight: 30, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 30, enabled: false },
      markets: { weight: 50, maxDistance: 1500, enabled: true },
      water: { weight: 50, maxDistance: 1500, enabled: true },
      industrial: { weight: -60, maxDistance: 1500, enabled: true },
      highways: { weight: -50, maxDistance: 600, enabled: true },
      airports: { weight: -60, maxDistance: 3000, enabled: true },
      railways: { weight: -40, maxDistance: 500, enabled: true },
      cemeteries: { weight: 0, enabled: false }, // Neutral for seniors
      construction: { weight: -50, maxDistance: 500, enabled: true },
    },
  },
];

/**
 * Convert a POICategory to a Factor
 */
function categoryToFactor(category: POICategory): Factor {
  return {
    id: category.id,
    name: category.name,
    osmTags: getOsmTags(category),
    weight: category.defaultWeight,
    defaultWeight: category.defaultWeight,
    enabled: category.defaultEnabled,
    maxDistance: category.defaultMaxDistance,
    icon: category.icon,
    category: category.category,
  };
}

/**
 * Default factors generated from POI_CATEGORIES
 */
export const DEFAULT_FACTORS: Factor[] = POI_CATEGORIES.map(categoryToFactor);

/**
 * Apply a profile to the default factors
 */
export function applyProfile(profileId: string): Factor[] {
  const profile = FACTOR_PROFILES.find((p) => p.id === profileId);
  if (!profile) return DEFAULT_FACTORS;

  return DEFAULT_FACTORS.map((factor) => {
    const override = profile.overrides[factor.id];
    if (!override) return factor;

    return {
      ...factor,
      weight: override.weight ?? factor.weight,
      maxDistance: override.maxDistance ?? factor.maxDistance,
      enabled: override.enabled ?? factor.enabled,
    };
  });
}

export const POLAND_BOUNDS = {
  north: 54.9,
  south: 49.0,
  east: 24.2,
  west: 14.1,
};

export const POLAND_CENTER = {
  lat: 52.0,
  lng: 19.0,
};

export const DEFAULT_GRID_SIZE = 200; // meters

export const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
