/**
 * Performance Profiling Utilities
 * 
 * Structured JSON logging for performance monitoring.
 * Enable with NEXT_PUBLIC_PROFILING=true environment variable.
 */

const PROFILING_ENABLED = process.env.NEXT_PUBLIC_PROFILING === 'true';

/** Log a performance metric with structured JSON output */
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

/** Create a timer that logs duration when stopped */
export function createTimer(label: string): (metadata?: Record<string, unknown>) => void {
  const start = performance.now();
  return (metadata?: Record<string, unknown>) => logPerf(label, performance.now() - start, metadata);
}
