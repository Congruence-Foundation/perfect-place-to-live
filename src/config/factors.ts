import type { Factor } from '@/types/factors';
import { POI_CATEGORIES, POICategory, getOsmTags } from './poi-categories';

/**
 * Profile type definition for factor presets
 * Internal type - not exported as it's only used within this module
 */
interface FactorProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Factor overrides: factorId -> { weight, maxDistance, enabled } */
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
      // Essential - core factors for daily European life
      grocery: { weight: 85, maxDistance: 1200, enabled: true },
      transit: { weight: 80, maxDistance: 1000, enabled: true },
      parks: { weight: 70, maxDistance: 1000, enabled: true },
      post: { weight: 55, maxDistance: 1200, enabled: true },
      restaurants: { weight: 50, maxDistance: 1000, enabled: true },
      // Disabled by default
      healthcare: { weight: 70, enabled: false },
      schools: { weight: 45, enabled: false },
      banks: { weight: 35, enabled: false },
      gyms: { weight: 30, enabled: false },
      playgrounds: { weight: 35, enabled: false },
      stadiums: { weight: 0, enabled: false },
      nightlife: { weight: 0, enabled: false },
      universities: { weight: 0, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 0, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 25, enabled: false },
      markets: { weight: 35, enabled: false },
      water: { weight: 40, enabled: false },
      // Environment - industrial with reduced importance
      industrial: { weight: -20, maxDistance: 1500, enabled: true },
      highways: { weight: -40, enabled: false },
      airports: { weight: -40, enabled: false },
      railways: { weight: -25, enabled: false },
      cemeteries: { weight: -15, enabled: false },
      construction: { weight: -35, enabled: false },
      city_center: { weight: 30, enabled: false },
      city_downtown: { weight: -20, enabled: false },
    },
  },
  {
    id: 'family',
    name: 'Family',
    description: 'Schools, parks, playgrounds, quiet areas',
    icon: 'users',
    overrides: {
      grocery: { weight: 85, maxDistance: 1200, enabled: true },
      transit: { weight: 55, maxDistance: 1000, enabled: true },
      healthcare: { weight: 90, maxDistance: 3000, enabled: true }, // Pediatric specialists
      parks: { weight: 95, maxDistance: 800, enabled: true },
      schools: { weight: 100, maxDistance: 1500, enabled: true }, // Walking distance for kids
      post: { weight: 35, enabled: true },
      restaurants: { weight: 25, enabled: false },
      banks: { weight: 30, enabled: false },
      gyms: { weight: 35, enabled: false },
      playgrounds: { weight: 95, maxDistance: 500, enabled: true },
      stadiums: { weight: -35, maxDistance: 1500, enabled: true }, // Noise, crowds
      nightlife: { weight: -65, maxDistance: 800, enabled: true }, // Noise, not family-friendly
      universities: { weight: 0, enabled: false },
      religious: { weight: 40, enabled: false },
      dog_parks: { weight: 50, maxDistance: 1000, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 35, maxDistance: 2000, enabled: false },
      markets: { weight: 45, enabled: false },
      water: { weight: 55, maxDistance: 1500, enabled: true },
      industrial: { weight: -80, maxDistance: 2000, enabled: true }, // Air quality for kids
      highways: { weight: -75, maxDistance: 400, enabled: true }, // Noise + safety
      airports: { weight: -60, maxDistance: 5000, enabled: true }, // Flight path noise
      railways: { weight: -50, maxDistance: 400, enabled: true },
      cemeteries: { weight: -25, enabled: false },
      construction: { weight: -55, maxDistance: 400, enabled: true },
      city_center: { weight: 45, maxDistance: 12000, enabled: true },
      city_downtown: { weight: -70, maxDistance: 4000, enabled: true }, // Avoid busy downtown
    },
  },
  {
    id: 'young-professional',
    name: 'Urban Pro',
    description: 'Transit, nightlife, gyms, urban living',
    icon: 'briefcase',
    overrides: {
      grocery: { weight: 70, maxDistance: 800, enabled: true },
      transit: { weight: 100, maxDistance: 600, enabled: true }, // Critical for commute
      healthcare: { weight: 50, maxDistance: 2000, enabled: true },
      parks: { weight: 50, maxDistance: 800, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 55, maxDistance: 1200, enabled: true },
      train_stations: { weight: 70, maxDistance: 2000, enabled: true }, // Quick access to intercity travel
      restaurants: { weight: 85, maxDistance: 600, enabled: true },
      banks: { weight: 55, maxDistance: 1200, enabled: true },
      gyms: { weight: 80, maxDistance: 1000, enabled: true }, // Quick gym access
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: 40, maxDistance: 2000, enabled: true }, // Events, social
      nightlife: { weight: 70, maxDistance: 800, enabled: true }, // Social life
      universities: { weight: 25, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 0, enabled: false },
      coworking: { weight: 65, maxDistance: 1200, enabled: true }, // Hybrid work
      cinemas: { weight: 50, maxDistance: 1500, enabled: true },
      markets: { weight: 40, enabled: false },
      water: { weight: 35, enabled: false },
      industrial: { weight: -35, maxDistance: 1000, enabled: true },
      highways: { weight: -25, maxDistance: 250, enabled: true },
      airports: { weight: -30, enabled: false },
      railways: { weight: -20, maxDistance: 250, enabled: false },
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -25, maxDistance: 300, enabled: false },
      city_center: { weight: 80, maxDistance: 8000, enabled: true },
      city_downtown: { weight: 0, enabled: false }, // Don't mind downtown
    },
  },
  {
    id: 'remote-worker',
    name: 'Remote Worker',
    description: 'Quiet, parks, cafes, less transit focus',
    icon: 'laptop',
    overrides: {
      grocery: { weight: 85, maxDistance: 1500, enabled: true }, // More frequent shopping
      transit: { weight: 30, maxDistance: 1500, enabled: true }, // Occasional trips
      healthcare: { weight: 60, maxDistance: 2500, enabled: true },
      parks: { weight: 90, maxDistance: 1000, enabled: true }, // Breaks, walks
      schools: { weight: -25, maxDistance: 400, enabled: true }, // Daytime noise
      post: { weight: 75, maxDistance: 1200, enabled: true }, // Package deliveries
      restaurants: { weight: 55, maxDistance: 1200, enabled: true }, // Lunch breaks
      banks: { weight: 40, enabled: true },
      gyms: { weight: 50, maxDistance: 1500, enabled: true },
      playgrounds: { weight: -25, maxDistance: 400, enabled: true }, // Daytime noise
      stadiums: { weight: -45, maxDistance: 1500, enabled: true }, // Event noise
      nightlife: { weight: -35, maxDistance: 600, enabled: true }, // Night noise
      universities: { weight: 25, enabled: false }, // Cafes nearby
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 40, enabled: false },
      coworking: { weight: 80, maxDistance: 1500, enabled: true }, // Change of scenery
      cinemas: { weight: 20, enabled: false },
      markets: { weight: 35, enabled: false },
      water: { weight: 60, maxDistance: 1500, enabled: true }, // Peaceful views
      industrial: { weight: -70, maxDistance: 1500, enabled: true },
      highways: { weight: -65, maxDistance: 350, enabled: true }, // Need quiet
      airports: { weight: -55, maxDistance: 4000, enabled: true },
      railways: { weight: -45, maxDistance: 350, enabled: true },
      cemeteries: { weight: 15, enabled: false }, // Quiet!
      construction: { weight: -65, maxDistance: 400, enabled: true }, // Noise disrupts work
      city_center: { weight: 35, maxDistance: 8000, enabled: false },
      city_downtown: { weight: -45, maxDistance: 3000, enabled: true },
    },
  },
  {
    id: 'active-lifestyle',
    name: 'Active Lifestyle',
    description: 'Gyms, parks, sports facilities',
    icon: 'activity',
    overrides: {
      grocery: { weight: 70, maxDistance: 1200, enabled: true },
      transit: { weight: 60, maxDistance: 1000, enabled: true },
      healthcare: { weight: 55, maxDistance: 2500, enabled: true }, // Sports injuries
      parks: { weight: 100, maxDistance: 1000, enabled: true }, // Running, cycling
      schools: { weight: 0, enabled: false },
      post: { weight: 30, enabled: true },
      restaurants: { weight: 50, maxDistance: 1000, enabled: true },
      banks: { weight: 25, enabled: false },
      gyms: { weight: 100, maxDistance: 1500, enabled: true }, // Specialty gyms less common
      playgrounds: { weight: 20, enabled: false },
      stadiums: { weight: 80, maxDistance: 3000, enabled: true }, // Sports events!
      nightlife: { weight: 30, enabled: false },
      universities: { weight: 0, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 60, maxDistance: 1000, enabled: true }, // Running with dogs
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 20, enabled: false },
      markets: { weight: 30, enabled: false },
      water: { weight: 75, maxDistance: 2000, enabled: true }, // Swimming, kayaking, running paths
      industrial: { weight: -50, maxDistance: 1500, enabled: true }, // Air quality
      highways: { weight: -40, maxDistance: 300, enabled: true },
      airports: { weight: -30, enabled: false },
      railways: { weight: -20, enabled: false },
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -30, enabled: false },
      city_center: { weight: 30, enabled: false },
      city_downtown: { weight: 0, enabled: false },
    },
  },
  {
    id: 'student',
    name: 'Student',
    description: 'Universities, transit, affordable food, nightlife',
    icon: 'graduation-cap',
    overrides: {
      grocery: { weight: 90, maxDistance: 800, enabled: true }, // Budget shopping, walking
      transit: { weight: 95, maxDistance: 500, enabled: true }, // Critical for students
      healthcare: { weight: 45, maxDistance: 2000, enabled: true },
      parks: { weight: 50, maxDistance: 800, enabled: true },
      schools: { weight: 0, enabled: false },
      post: { weight: 45, maxDistance: 1000, enabled: true },
      train_stations: { weight: 60, maxDistance: 2500, enabled: true }, // Travel to other cities
      restaurants: { weight: 60, maxDistance: 800, enabled: true }, // Affordable food
      banks: { weight: 50, maxDistance: 1200, enabled: true },
      gyms: { weight: 60, maxDistance: 1500, enabled: true },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: 40, enabled: false },
      nightlife: { weight: 80, maxDistance: 1200, enabled: true }, // Social life
      universities: { weight: 100, maxDistance: 4000, enabled: true }, // Student housing often further
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 0, enabled: false },
      coworking: { weight: 70, maxDistance: 1500, enabled: true }, // Study spaces, libraries
      cinemas: { weight: 40, maxDistance: 2000, enabled: true },
      markets: { weight: 35, enabled: false },
      water: { weight: 25, enabled: false },
      industrial: { weight: -30, maxDistance: 1000, enabled: true },
      highways: { weight: -20, maxDistance: 250, enabled: true },
      airports: { weight: -20, enabled: false },
      railways: { weight: -15, maxDistance: 250, enabled: false },
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -25, maxDistance: 300, enabled: false },
      city_center: { weight: 70, maxDistance: 8000, enabled: true },
      city_downtown: { weight: 0, enabled: false }, // Students like central areas
    },
  },
  {
    id: 'established',
    name: 'Settled',
    description: 'Quality dining, culture, quiet residential',
    icon: 'gem',
    overrides: {
      grocery: { weight: 80, maxDistance: 1500, enabled: true },
      transit: { weight: 50, maxDistance: 1500, enabled: true },
      healthcare: { weight: 80, maxDistance: 3000, enabled: true }, // Specialists
      parks: { weight: 85, maxDistance: 1200, enabled: true }, // Quality of life
      schools: { weight: 0, enabled: false },
      post: { weight: 50, maxDistance: 1500, enabled: true },
      restaurants: { weight: 85, maxDistance: 1500, enabled: true }, // Quality dining
      banks: { weight: 50, maxDistance: 1500, enabled: true },
      gyms: { weight: 60, maxDistance: 2000, enabled: true },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: -25, maxDistance: 1500, enabled: true }, // Prefer quiet
      nightlife: { weight: -45, maxDistance: 800, enabled: true }, // Avoid noise
      universities: { weight: 0, enabled: false },
      religious: { weight: 30, enabled: false },
      dog_parks: { weight: 40, enabled: false },
      coworking: { weight: 30, enabled: false },
      cinemas: { weight: 55, maxDistance: 2500, enabled: true }, // Cultural venues
      markets: { weight: 65, maxDistance: 2000, enabled: true }, // Quality markets, farmers markets
      water: { weight: 70, maxDistance: 2000, enabled: true }, // Scenic views
      industrial: { weight: -70, maxDistance: 2000, enabled: true },
      highways: { weight: -60, maxDistance: 400, enabled: true },
      airports: { weight: -55, maxDistance: 5000, enabled: true },
      railways: { weight: -45, maxDistance: 400, enabled: true },
      cemeteries: { weight: -20, enabled: false },
      construction: { weight: -55, maxDistance: 500, enabled: true },
      city_center: { weight: 50, maxDistance: 10000, enabled: true },
      city_downtown: { weight: -35, maxDistance: 3000, enabled: true },
    },
  },
  {
    id: 'suburban',
    name: 'Suburban',
    description: 'Outside city, railway commute, basic amenities',
    icon: 'train-front',
    overrides: {
      // Essential infrastructure
      grocery: { weight: 90, maxDistance: 1500, enabled: true },
      transit: { weight: 40, maxDistance: 1500, enabled: true }, // Less important, but nice to have
      train_stations: { weight: 100, maxDistance: 3000, enabled: true }, // Critical for commuting to city
      healthcare: { weight: 65, maxDistance: 3000, enabled: true },
      parks: { weight: 75, maxDistance: 1200, enabled: true },
      schools: { weight: 50, enabled: false }, // Enable if you have kids
      post: { weight: 55, maxDistance: 1500, enabled: true },
      restaurants: { weight: 35, maxDistance: 1500, enabled: false }, // Less variety expected
      banks: { weight: 40, enabled: false },
      gyms: { weight: 35, enabled: false },
      playgrounds: { weight: 40, enabled: false },
      stadiums: { weight: 0, enabled: false },
      nightlife: { weight: 0, enabled: false },
      universities: { weight: 0, enabled: false },
      religious: { weight: 0, enabled: false },
      dog_parks: { weight: 45, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 20, enabled: false },
      markets: { weight: 40, enabled: false },
      water: { weight: 50, maxDistance: 2000, enabled: false },
      // Environment - prefer quieter suburban areas
      industrial: { weight: -45, maxDistance: 1500, enabled: true },
      highways: { weight: -35, maxDistance: 400, enabled: true }, // Some tolerance, need car access
      airports: { weight: -40, enabled: false },
      railways: { weight: -15, maxDistance: 300, enabled: true }, // Minor negative, trains are good
      cemeteries: { weight: -10, enabled: false },
      construction: { weight: -30, enabled: false },
      city_center: { weight: 50, maxDistance: 15000, enabled: true }, // Want to be within reach but not too close
      city_downtown: { weight: -50, maxDistance: 5000, enabled: true }, // Avoid downtown
    },
  },
  {
    id: 'senior',
    name: 'Senior',
    description: 'Healthcare, quiet, accessible services',
    icon: 'heart',
    overrides: {
      grocery: { weight: 95, maxDistance: 800, enabled: true }, // Walking distance critical
      transit: { weight: 85, maxDistance: 600, enabled: true }, // Mobility
      healthcare: { weight: 100, maxDistance: 2000, enabled: true }, // Specialists, hospitals
      parks: { weight: 85, maxDistance: 600, enabled: true }, // Daily walks
      schools: { weight: 0, enabled: false },
      post: { weight: 75, maxDistance: 800, enabled: true }, // In-person services
      restaurants: { weight: 45, maxDistance: 1000, enabled: true },
      banks: { weight: 65, maxDistance: 1000, enabled: true }, // In-person banking
      gyms: { weight: 30, enabled: false },
      playgrounds: { weight: 0, enabled: false },
      stadiums: { weight: -55, maxDistance: 1500, enabled: true }, // Noise, crowds
      nightlife: { weight: -75, maxDistance: 800, enabled: true }, // Noise
      universities: { weight: 0, enabled: false },
      religious: { weight: 55, maxDistance: 1200, enabled: true }, // Often important for seniors
      dog_parks: { weight: 30, enabled: false },
      coworking: { weight: 0, enabled: false },
      cinemas: { weight: 35, maxDistance: 2000, enabled: false },
      markets: { weight: 55, maxDistance: 1200, enabled: true }, // Fresh food, social
      water: { weight: 50, maxDistance: 1500, enabled: true },
      industrial: { weight: -65, maxDistance: 2000, enabled: true }, // Air quality
      highways: { weight: -55, maxDistance: 350, enabled: true }, // Noise affects sleep
      airports: { weight: -60, maxDistance: 5000, enabled: true },
      railways: { weight: -45, maxDistance: 350, enabled: true },
      cemeteries: { weight: 0, enabled: false }, // Neutral for seniors
      construction: { weight: -55, maxDistance: 400, enabled: true },
      city_center: { weight: 40, maxDistance: 10000, enabled: true },
      city_downtown: { weight: -60, maxDistance: 4000, enabled: true }, // Avoid busy areas
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

/**
 * Filter factors to only those that are enabled and have non-zero weight
 * Used for heatmap calculations to skip disabled factors
 * 
 * @param factors - Array of factors to filter
 * @returns Array of enabled factors with non-zero weight
 */
export function getEnabledFactors(factors: Factor[]): Factor[] {
  return factors.filter(f => f.enabled && f.weight !== 0);
}
