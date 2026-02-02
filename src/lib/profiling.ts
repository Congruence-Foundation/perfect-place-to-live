/**
 * Performance Profiling Utilities
 * 
 * Provides structured JSON logging for performance monitoring.
 * Enable with NEXT_PUBLIC_PROFILING=true environment variable.
 */

const PROFILING_ENABLED = process.env.NEXT_PUBLIC_PROFILING === 'true';

/**
 * Log a performance metric with structured JSON output
 * 
 * @param label - Metric label (e.g., "heatmap:poi-fetch")
 * @param durationMs - Duration in milliseconds
 * @param metadata - Additional metadata to include in the log
 */
export function logPerf(label: string, durationMs: number, metadata?: Record<string, unknown>): void {
  if (!PROFILING_ENABLED) return;
  console.log(JSON.stringify({
    type: 'perf',
    label,
    durationMs: Math.round(durationMs * 100) / 100,
    ts: Date.now(),
    ...metadata,
  }));
}

/**
 * Create a timer that logs when stopped
 * 
 * @param label - Metric label for the timer
 * @returns Function to stop the timer and log the duration
 * 
 * @example
 * const stopTimer = createTimer('heatmap:fetch');
 * // ... do work ...
 * stopTimer({ tiles: 12, cached: 8 });
 */
export function createTimer(label: string): (metadata?: Record<string, unknown>) => void {
  const start = performance.now();
  return (metadata?: Record<string, unknown>) => logPerf(label, performance.now() - start, metadata);
}

/**
 * Check if profiling is enabled
 */
export function isProfilingEnabled(): boolean {
  return PROFILING_ENABLED;
}
