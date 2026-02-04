/**
 * Scoring utilities
 * Re-exports all scoring-related functions
 * 
 * NOTE: calculator-parallel.ts is NOT exported here because it uses
 * Node.js-only modules (worker_threads) and cannot be imported in
 * client-side code. Import it directly in server-side code:
 * import { calculateHeatmapParallel } from '@/lib/scoring/calculator-parallel';
 */

// Calculator functions
export {
  calculateHeatmap,
  calculateFactorBreakdown,
  normalizeKValues,
  logKStats,
  buildSpatialIndexes,
} from './calculator';

export type { FactorBreakdown, FactorBreakdownResult } from './calculator';
