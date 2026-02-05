'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Bug, AlertCircle } from 'lucide-react';
import { ExtensionsDebugPanel } from './ExtensionsDebugPanel';
import { PanelHeader } from '@/components/ui/panel-header';
import { PanelToggleButton } from './PanelToggleButton';
import { FloatingPanel } from './FloatingPanel';
import { Z_INDEX } from '@/constants/z-index';

interface L2CacheStatus {
  type: 'redis' | 'memory';
  connected: boolean;
  latencyMs?: number;
  redisKeyCount?: number;
}

interface L1CacheStats {
  heatmap: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
  poi: { size: number; max: number; l1Hits: number; l2Hits: number; misses: number };
}

interface DebugInfoProps {
  enabledFactorCount: number;
  metadata: {
    pointCount: number;
    computeTimeMs: number;
    l1CacheStats?: L1CacheStats;
  } | null;
  totalPOICount: number;
  error: string | null;
  isMobile?: boolean;
  zoomLevel?: number;
}

export default function DebugInfo({
  enabledFactorCount,
  metadata,
  totalPOICount,
  error,
  isMobile = false,
  zoomLevel,
}: DebugInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [l2Status, setL2Status] = useState<L2CacheStatus | null>(null);
  const t = useTranslations('debug');

  // Fetch L2 status ONCE when panel opens (no polling to avoid server load)
  useEffect(() => {
    if (!isOpen || l2Status !== null) return;
    
    fetch('/api/cache/status')
      .then(res => res.json())
      .then(data => {
        setL2Status({
          type: data.cache.type,
          connected: data.cache.connection.success,
          latencyMs: data.cache.connection.latencyMs,
          redisKeyCount: data.cache.redisStats?.keyCount,
        });
      })
      // Silently ignore errors - cache status is non-critical debug info
      .catch(() => setL2Status(null));
  }, [isOpen, l2Status]);

  // Reset L2 status when panel closes so it refetches on next open
  // This is a legitimate pattern - we want to clear stale data when the panel closes
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setL2Status(null);
    }
  }, [isOpen]);

  // Get cache stats from metadata (comes from heatmap API, no extra requests)
  const l1CacheStats = metadata?.l1CacheStats;

  return (
    <div 
      className={isMobile ? 'relative' : 'absolute bottom-4 left-4'}
      style={{ zIndex: Z_INDEX.FLOATING_CONTROLS }}
    >
      <FloatingPanel
        isOpen={isOpen}
        position="bottom-left"
        width="w-56"
        ariaLabel={t('title')}
      >
        <PanelHeader title={t('title')} onClose={() => setIsOpen(false)} />

        <div className="space-y-2 text-xs">
          {/* Map Info Section */}
          {zoomLevel !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('zoomLevel')}</span>
              <span className="font-mono font-medium">{zoomLevel.toFixed(1)}</span>
            </div>
          )}
          
          {/* Heatmap Section */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('activeFactors')}</span>
            <span className="font-mono font-medium">{enabledFactorCount}</span>
          </div>
          {metadata && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('gridPoints')}</span>
                <span className="font-mono font-medium">{metadata.pointCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('poisLoaded')}</span>
                <span className="font-mono font-medium">{totalPOICount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('computeTime')}</span>
                <span className="font-mono font-medium">{metadata.computeTimeMs}ms</span>
              </div>
            </>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-destructive mt-2 pt-2 border-t">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}
          
          {/* Extension Debug Panels - Self-contained (rendered at the end) */}
          <ExtensionsDebugPanel />
          
          {/* Cache Section */}
          {(l2Status || l1CacheStats) && (
            <>
              <div className="border-t pt-2 mt-2">
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{t('cache')}</span>
              </div>
              
              {/* L2 - Redis/Memory (fetched once on panel open) */}
              {l2Status && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">L2</span>
                    <span className={`font-mono font-medium ${l2Status.type === 'redis' && l2Status.connected ? 'text-green-500' : 'text-yellow-500'}`}>
                      {l2Status.type === 'redis' 
                        ? `Redis ${l2Status.connected ? `(${l2Status.latencyMs}ms)` : '(err)'}`
                        : 'Memory'
                      }
                    </span>
                  </div>
                  {l2Status.type === 'redis' && l2Status.redisKeyCount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">L2 Keys</span>
                      <span className="font-mono font-medium">{l2Status.redisKeyCount.toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
              
              {/* Cache hit stats (from heatmap API response - no extra requests) */}
              {l1CacheStats && (
                <div className="mt-1 space-y-1">
                  {/* Header row */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                    <span></span>
                    <span className="text-right">L1</span>
                    <span className="text-right">L2</span>
                    <span className="text-right">Miss</span>
                  </div>
                  {/* Heatmap row */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                    <span className="text-muted-foreground">Heatmap</span>
                    <span className="text-right font-medium">{l1CacheStats.heatmap.l1Hits}</span>
                    <span className="text-right font-medium">{l1CacheStats.heatmap.l2Hits}</span>
                    <span className="text-right font-medium">{l1CacheStats.heatmap.misses}</span>
                  </div>
                  {/* POI row */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                    <span className="text-muted-foreground">POI</span>
                    <span className="text-right font-medium">{l1CacheStats.poi.l1Hits}</span>
                    <span className="text-right font-medium">{l1CacheStats.poi.l2Hits}</span>
                    <span className="text-right font-medium">{l1CacheStats.poi.misses}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </FloatingPanel>

      {/* Toggle Button */}
      <PanelToggleButton
        Icon={Bug}
        ErrorIcon={AlertCircle}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        title={t('title')}
        hasError={!!error}
      />
    </div>
  );
}
