// Otodom API
export { fetchOtodomProperties, fetchClusterProperties } from './otodom';

// Price analysis
export {
  enrichPropertiesWithPriceScore,
  enrichPropertiesSimplified,
  filterPropertiesByPriceValue,
  analyzeClusterPrices,
} from './price-analysis';
export type { ClusterPriceAnalysis, ClusterAnalysisMap } from './price-analysis';

// Price colors (re-export from config for backward compatibility)
export { PRICE_CATEGORY_COLORS } from '../config/price-colors';

// Property markers
export {
  generatePropertyMarkerHtml,
  getPropertyMarkerClassName,
} from './property-markers';

// Score lookup
export { filterPropertiesByScore, filterClustersByScore, findNearestHeatmapPoint } from './score-lookup';
