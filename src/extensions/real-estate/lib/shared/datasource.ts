/**
 * Property Data Source Interface and Factory
 *
 * Provides a unified interface for fetching property data from multiple sources
 * (Otodom, Gratka, etc.) with consistent types and error handling.
 */

import type { PropertyDataSource } from '../../config/filters';
import type {
  UnifiedSearchParams,
  UnifiedSearchResult,
  UnifiedCluster,
  UnifiedLocationSuggestion,
} from './types';

// ============================================================================
// Data Source Interface
// ============================================================================

/**
 * Interface for property data sources
 *
 * Each data source (Otodom, Gratka) implements this interface through an adapter.
 * This allows consumers to work with any source without knowing the underlying API.
 */
export interface IPropertyDataSource {
  /** Unique identifier for this data source */
  readonly name: PropertyDataSource;

  /** Human-readable display name */
  readonly displayName: string;

  /**
   * Search for properties within given bounds and filters
   *
   * Returns both individual properties (when zoomed in) and clusters (when zoomed out).
   * The source decides based on zoom level / result count.
   */
  searchProperties(params: UnifiedSearchParams): Promise<UnifiedSearchResult>;

  /**
   * Search for map markers/clusters only (optimized for map display)
   *
   * Use this when you only need cluster data for the map, not full property details.
   */
  searchMapMarkers(params: UnifiedSearchParams): Promise<UnifiedCluster[]>;

  /**
   * Get location suggestions for autocomplete
   *
   * Optional - not all sources support this.
   */
  getLocationSuggestions?(
    query: string,
    options?: { limit?: number }
  ): Promise<UnifiedLocationSuggestion[]>;

  /**
   * Check if this source supports a specific feature
   */
  supportsFeature(feature: DataSourceFeature): boolean;
}

/**
 * Features that data sources may or may not support
 */
export type DataSourceFeature =
  | 'location-suggestions'
  | 'map-clustering'
  | 'price-per-meter-filter'
  | 'build-year-filter'
  | 'floor-filter'
  | 'building-material-filter'
  | 'extras-filter'
  | 'listing-age-filter';

// ============================================================================
// Multi-Source Aggregator
// ============================================================================

/**
 * Aggregates results from multiple data sources
 *
 * Fetches from all enabled sources in parallel and merges results.
 */
export class MultiSourceDataSource implements IPropertyDataSource {
  readonly name: PropertyDataSource; // Uses first source's name for ID purposes
  readonly displayName = 'All Sources';

  private sources: IPropertyDataSource[];

  constructor(sources: IPropertyDataSource[]) {
    if (sources.length === 0) {
      throw new Error('MultiSourceDataSource requires at least one source');
    }
    this.sources = sources;
    this.name = sources[0].name; // Use first source's name for compatibility
  }

  async searchProperties(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    // Fetch from all sources in parallel
    const results = await Promise.allSettled(
      this.sources.map((source) => source.searchProperties(params))
    );

    // Merge successful results
    const mergedProperties: UnifiedSearchResult['properties'] = [];
    const mergedClusters: UnifiedSearchResult['clusters'] = [];
    const contributingSources: PropertyDataSource[] = [];
    let totalCount = 0;
    let anyCached = false;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        mergedProperties.push(...result.value.properties);
        mergedClusters.push(...result.value.clusters);
        totalCount += result.value.totalCount;
        contributingSources.push(...result.value.sources);
        if (result.value.cached) anyCached = true;
      } else {
        // Log error but continue with other sources
        console.warn(
          `Data source ${this.sources[i].name} failed:`,
          result.reason
        );
      }
    }

    // Deduplicate by unified ID (in case same property appears in multiple sources)
    const seenIds = new Set<string>();
    const uniqueProperties = mergedProperties.filter((p) => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    return {
      properties: uniqueProperties,
      clusters: mergedClusters,
      totalCount,
      cached: anyCached,
      fetchedAt: new Date().toISOString(),
      sources: [...new Set(contributingSources)],
    };
  }

  async searchMapMarkers(params: UnifiedSearchParams): Promise<UnifiedCluster[]> {
    const results = await Promise.allSettled(
      this.sources.map((source) => source.searchMapMarkers(params))
    );

    const mergedClusters: UnifiedCluster[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        mergedClusters.push(...result.value);
      } else {
        console.warn(
          `Data source ${this.sources[i].name} failed:`,
          result.reason
        );
      }
    }

    return mergedClusters;
  }

  async getLocationSuggestions(
    query: string,
    options?: { limit?: number }
  ): Promise<UnifiedLocationSuggestion[]> {
    // Use first source that supports location suggestions
    for (const source of this.sources) {
      if (source.getLocationSuggestions) {
        return source.getLocationSuggestions(query, options);
      }
    }
    return [];
  }

  supportsFeature(feature: DataSourceFeature): boolean {
    // Feature is supported if any source supports it
    return this.sources.some((source) => source.supportsFeature(feature));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

// Import adapters lazily to avoid circular dependencies
type AdapterConstructor = new () => IPropertyDataSource;
let OtodomAdapter: AdapterConstructor | undefined;
let GratkaAdapter: AdapterConstructor | undefined;

/**
 * Create a data source adapter for the specified source
 */
export async function createDataSource(
  source: PropertyDataSource
): Promise<IPropertyDataSource> {
  switch (source) {
    case 'otodom': {
      if (!OtodomAdapter) {
        const otodomModule = await import('../otodom/adapter');
        OtodomAdapter = otodomModule.OtodomAdapter;
      }
      return new OtodomAdapter();
    }
    case 'gratka': {
      if (!GratkaAdapter) {
        const gratkaModule = await import('../gratka/adapter');
        GratkaAdapter = gratkaModule.GratkaAdapter;
      }
      return new GratkaAdapter();
    }
    default:
      throw new Error(`Unknown data source: ${source}`);
  }
}

/**
 * Create a multi-source aggregator for the specified sources
 */
export async function createMultiSource(
  sources: PropertyDataSource[]
): Promise<IPropertyDataSource> {
  if (sources.length === 0) {
    throw new Error('At least one data source must be specified');
  }

  if (sources.length === 1) {
    return createDataSource(sources[0]);
  }

  const adapters = await Promise.all(sources.map(createDataSource));
  return new MultiSourceDataSource(adapters);
}
