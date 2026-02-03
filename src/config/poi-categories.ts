/**
 * Common POI Categories Configuration
 *
 * This is the single source of truth for all POI categories used in:
 * - Frontend factors configuration (src/config/factors.ts)
 * - OSM data extraction (scripts/extract-pois.ts)
 * - Osmium filter generation (scripts/osmium-filters.txt)
 *
 * Each category defines:
 * - id: Unique identifier used in database and API
 * - name: Human-readable name
 * - osmFilters: Array of osmium filter expressions with type prefix (e.g., "nw/shop=supermarket")
 * - category: Grouping for UI (essential, lifestyle, environment)
 * - icon: Lucide icon name for UI
 * - defaultWeight: Default weight for heatmap calculation
 * - defaultMaxDistance: Default max distance in meters
 * - defaultEnabled: Whether enabled by default
 */

import type { FactorCategory } from '@/types/factors';

export interface POICategory {
  id: string;
  name: string;
  /** Osmium filter expressions with type prefix: n=node, w=way, a=area
   * Examples: "nw/shop=supermarket", "n/amenity=atm", "w/highway=motorway"
   */
  osmFilters: string[];
  category: FactorCategory;
  icon: string;
  defaultWeight: number;
  defaultMaxDistance: number;
  defaultEnabled: boolean;
}

/**
 * All POI categories used in the application
 */
export const POI_CATEGORIES: POICategory[] = [
  // ============================================
  // ESSENTIAL FACTORS
  // ============================================
  {
    id: 'grocery',
    name: 'Grocery Stores',
    osmFilters: [
      'nw/shop=supermarket',
      'nw/shop=convenience',
      'nw/shop=grocery',
    ],
    category: 'essential',
    icon: 'shopping-cart',
    defaultWeight: 80,
    defaultMaxDistance: 2000,
    defaultEnabled: true,
  },
  {
    id: 'transit',
    name: 'Public Transit',
    osmFilters: [
      'nw/railway=station',      // Stations can be nodes or areas
      'n/railway=halt',          // Halts are typically nodes
      'n/highway=bus_stop',      // Bus stops are nodes
      'n/railway=tram_stop',     // Tram stops are nodes
      'n/public_transport=platform',  // Platforms are nodes
      'nw/public_transport=station',  // Stations can be areas
    ],
    category: 'essential',
    icon: 'train',
    defaultWeight: 70,
    defaultMaxDistance: 1500,
    defaultEnabled: true,
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    osmFilters: [
      'nw/amenity=pharmacy',
      'nwa/amenity=hospital',    // Hospitals are often large areas
      'nw/amenity=clinic',
      'nw/amenity=doctors',
    ],
    category: 'essential',
    icon: 'heart-pulse',
    defaultWeight: 65,
    defaultMaxDistance: 3000,
    defaultEnabled: true,
  },
  {
    id: 'parks',
    name: 'Parks & Green Areas',
    osmFilters: [
      'nwa/leisure=park',
      'nwa/landuse=forest',
      'nwa/natural=wood',
      'nwa/leisure=garden',
    ],
    category: 'essential',
    icon: 'trees',
    defaultWeight: 60,
    defaultMaxDistance: 1500,
    defaultEnabled: true,
  },
  {
    id: 'schools',
    name: 'Schools',
    osmFilters: [
      'nwa/amenity=school',       // Schools are often mapped as areas
      'nwa/amenity=kindergarten',
      'nwa/amenity=college',
    ],
    category: 'essential',
    icon: 'graduation-cap',
    defaultWeight: 50,
    defaultMaxDistance: 2000,
    defaultEnabled: true,
  },
  {
    id: 'post',
    name: 'Post & Delivery',
    osmFilters: [
      'nw/amenity=post_office',
      'nw/amenity=parcel_locker',
      'n/amenity=post_box',       // Post boxes are always nodes
    ],
    category: 'essential',
    icon: 'package',
    defaultWeight: 40,
    defaultMaxDistance: 2000,
    defaultEnabled: true,
  },

  // ============================================
  // LIFESTYLE FACTORS
  // ============================================
  {
    id: 'train_stations',
    name: 'Train Stations',
    osmFilters: [
      'nw/railway=station',       // Main railway stations
      'n/railway=halt',           // Smaller stops/halts
    ],
    category: 'lifestyle',
    icon: 'train-front',
    defaultWeight: 50,
    defaultMaxDistance: 3000,
    defaultEnabled: false,
  },
  {
    id: 'restaurants',
    name: 'Restaurants & Cafes',
    osmFilters: [
      'nw/amenity=restaurant',
      'nw/amenity=cafe',
      'nw/amenity=fast_food',
    ],
    category: 'lifestyle',
    icon: 'utensils',
    defaultWeight: 35,
    defaultMaxDistance: 1500,
    defaultEnabled: false,
  },
  {
    id: 'banks',
    name: 'Banks & ATMs',
    osmFilters: [
      'nw/amenity=bank',
      'n/amenity=atm',            // ATMs are always nodes
    ],
    category: 'lifestyle',
    icon: 'landmark',
    defaultWeight: 30,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },
  {
    id: 'gyms',
    name: 'Gyms & Sports',
    osmFilters: [
      'nwa/leisure=fitness_centre',
      'nwa/leisure=sports_centre',
      'nwa/leisure=swimming_pool',
    ],
    category: 'lifestyle',
    icon: 'dumbbell',
    defaultWeight: 25,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },
  {
    id: 'playgrounds',
    name: 'Playgrounds',
    osmFilters: [
      'nwa/leisure=playground',   // Playgrounds are often areas
    ],
    category: 'lifestyle',
    icon: 'baby',
    defaultWeight: 30,
    defaultMaxDistance: 1000,
    defaultEnabled: false,
  },
  {
    id: 'stadiums',
    name: 'Stadiums & Arenas',
    osmFilters: [
      'nwa/leisure=stadium',
      'nwa/building=stadium',
    ],
    category: 'lifestyle',
    icon: 'trophy',
    defaultWeight: 0,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },
  {
    id: 'nightlife',
    name: 'Nightlife & Bars',
    osmFilters: [
      'nw/amenity=bar',
      'nw/amenity=pub',
      'nw/amenity=nightclub',
      'nw/amenity=biergarten',
    ],
    category: 'lifestyle',
    icon: 'wine',
    defaultWeight: 0,
    defaultMaxDistance: 1500,
    defaultEnabled: false,
  },
  {
    id: 'universities',
    name: 'Universities',
    osmFilters: [
      'nwa/amenity=university',
      'nwa/building=university',
    ],
    category: 'lifestyle',
    icon: 'book-open',
    defaultWeight: 0,
    defaultMaxDistance: 3000,
    defaultEnabled: false,
  },
  {
    id: 'religious',
    name: 'Religious Sites',
    osmFilters: [
      'nwa/amenity=place_of_worship',
      'nwa/building=church',
      'nwa/building=mosque',
      'nwa/building=synagogue',
    ],
    category: 'lifestyle',
    icon: 'church',
    defaultWeight: 0,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },
  {
    id: 'dog_parks',
    name: 'Dog Parks',
    osmFilters: [
      'nwa/leisure=dog_park',
    ],
    category: 'lifestyle',
    icon: 'dog',
    defaultWeight: 0,
    defaultMaxDistance: 1500,
    defaultEnabled: false,
  },
  {
    id: 'coworking',
    name: 'Coworking & Libraries',
    osmFilters: [
      'nw/amenity=coworking_space',
      'nwa/amenity=library',      // Libraries are often buildings
      'nw/office=coworking',
    ],
    category: 'lifestyle',
    icon: 'laptop',
    defaultWeight: 0,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },
  {
    id: 'cinemas',
    name: 'Cinemas & Theaters',
    osmFilters: [
      'nwa/amenity=cinema',
      'nwa/amenity=theatre',
    ],
    category: 'lifestyle',
    icon: 'film',
    defaultWeight: 0,
    defaultMaxDistance: 3000,
    defaultEnabled: false,
  },
  {
    id: 'markets',
    name: 'Markets & Bazaars',
    osmFilters: [
      'nwa/amenity=marketplace',
      'nwa/shop=mall',
      'nwa/landuse=retail',
    ],
    category: 'lifestyle',
    icon: 'store',
    defaultWeight: 0,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },

  // ============================================
  // ENVIRONMENT FACTORS
  // ============================================
  {
    id: 'water',
    name: 'Water Bodies',
    osmFilters: [
      'nwa/natural=water',
      'nwa/water=lake',
      'nwa/water=river',
      'w/waterway=river',         // Rivers as ways (linear features)
      'w/natural=coastline',      // Coastlines are always ways
    ],
    category: 'environment',
    icon: 'waves',
    defaultWeight: 40,
    defaultMaxDistance: 2000,
    defaultEnabled: false,
  },
  {
    id: 'industrial',
    name: 'Industrial Areas',
    osmFilters: [
      'nwa/landuse=industrial',
      'nwa/landuse=quarry',
    ],
    category: 'environment',
    icon: 'factory',
    defaultWeight: -40,
    defaultMaxDistance: 1500,
    defaultEnabled: true,
  },
  {
    id: 'highways',
    name: 'Major Roads',
    osmFilters: [
      'w/highway=motorway',       // Roads are always ways
      'w/highway=trunk',
      'w/highway=primary',
    ],
    category: 'environment',
    icon: 'road',
    defaultWeight: -30,
    defaultMaxDistance: 300,
    defaultEnabled: true,
  },
  {
    id: 'airports',
    name: 'Airports',
    osmFilters: [
      'nwa/aeroway=aerodrome',
      'n/aeroway=helipad',        // Helipads are typically nodes
      'w/aeroway=runway',         // Runways are ways
    ],
    category: 'environment',
    icon: 'plane',
    defaultWeight: -40,
    defaultMaxDistance: 5000,
    defaultEnabled: false,
  },
  {
    id: 'railways',
    name: 'Railway Tracks',
    osmFilters: [
      'w/railway=rail',           // Railway tracks are always ways
      'w/railway=light_rail',
    ],
    category: 'environment',
    icon: 'train-track',
    defaultWeight: -30,
    defaultMaxDistance: 300,
    defaultEnabled: false,
  },
  {
    id: 'cemeteries',
    name: 'Cemeteries',
    osmFilters: [
      'nwa/landuse=cemetery',
      'nwa/amenity=grave_yard',
    ],
    category: 'environment',
    icon: 'cross',
    defaultWeight: -20,
    defaultMaxDistance: 500,
    defaultEnabled: false,
  },
  {
    id: 'construction',
    name: 'Construction Sites',
    osmFilters: [
      'nwa/landuse=construction',
      'nwa/building=construction',
    ],
    category: 'environment',
    icon: 'hard-hat',
    defaultWeight: -30,
    defaultMaxDistance: 500,
    defaultEnabled: false,
  },

  // ============================================
  // CITY/TOWN PROXIMITY FACTORS
  // ============================================
  {
    id: 'city_center',
    name: 'City/Town Access',
    osmFilters: [
      'n/place=city',   // Large cities (>100k population)
      'n/place=town',   // Medium towns (10k-100k population)
    ],
    category: 'lifestyle',
    icon: 'building-2',
    defaultWeight: 40,
    defaultMaxDistance: 15000,  // 15km broad access
    defaultEnabled: false,
  },
  {
    id: 'city_downtown',
    name: 'City Downtown',
    osmFilters: [
      'n/place=city',   // Only large cities - downtown noise/traffic/crowds
    ],
    category: 'environment',
    icon: 'volume-2',
    defaultWeight: -40,
    defaultMaxDistance: 4000,   // 4km - large city downtown impact
    defaultEnabled: false,
  },
];

/**
 * Extract OSM tags (without type prefix) from a category
 */
export function getOsmTags(category: POICategory): string[] {
  return category.osmFilters.map((filter) => {
    // Remove type prefix (e.g., "nw/" or "n/")
    const slashIndex = filter.indexOf('/');
    return slashIndex >= 0 ? filter.slice(slashIndex + 1) : filter;
  });
}

/**
 * Build a mapping of factor_id -> OSM tags for extraction
 */
export function buildTagMapping(): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};
  for (const cat of POI_CATEGORIES) {
    mapping[cat.id] = getOsmTags(cat);
  }
  return mapping;
}

/**
 * Generate osmium filter expressions from categories
 * Format: [type/]key=value where type is n=node, w=way, a=area
 */
export function generateOsmiumFilters(): string {
  const lines: string[] = [
    '# Osmium tag filter expressions for POI extraction',
    '# Auto-generated from src/config/poi-categories.ts',
    '# Format: [type/]key=value',
    '# Types: n=node, w=way, a=area (closed way or multipolygon)',
    '',
  ];

  const groups = {
    essential: '# === ESSENTIAL FACTORS ===',
    lifestyle: '# === LIFESTYLE FACTORS ===',
    environment: '# === ENVIRONMENT FACTORS ===',
  };

  for (const [groupKey, groupHeader] of Object.entries(groups)) {
    lines.push(groupHeader);
    lines.push('');

    const categories = POI_CATEGORIES.filter((cat) => cat.category === groupKey);

    for (const cat of categories) {
      lines.push(`# ${cat.id}: ${cat.name}`);

      for (const filter of cat.osmFilters) {
        lines.push(filter);
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}
