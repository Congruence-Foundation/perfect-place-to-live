// Otodom API
export { fetchOtodomProperties, fetchClusterProperties } from './otodom';

// Price analysis
export {
  enrichPropertiesWithPriceScore,
  enrichPropertiesSimplified,
  filterPropertiesByPriceValue,
  analyzeClusterPrices,
  getPricePerMeter,
} from './price-analysis';
export type { ClusterPriceAnalysis, ClusterAnalysisMap } from './price-analysis';

// Property markers
export {
  generatePropertyMarkerHtml,
  getPropertyMarkerClassName,
  PROPERTY_MARKER_COLORS,
} from './property-markers';

// Score lookup
export { filterPropertiesByScore, filterClustersByScore, findNearestHeatmapPoint } from './score-lookup';
