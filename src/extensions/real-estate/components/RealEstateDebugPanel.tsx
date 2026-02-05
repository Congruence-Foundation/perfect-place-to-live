'use client';

import { useRealEstateExtension } from '../hooks';

/**
 * Real Estate Debug Panel Component
 * 
 * Self-contained component that renders debug info for the real estate extension.
 * Uses useRealEstateExtension hook internally to access state.
 */
export function RealEstateDebugPanel() {
  const realEstate = useRealEstateExtension();
  
  // Don't render anything if extension is not enabled
  if (!realEstate.enabled) return null;
  
  return (
    <div className="border-t pt-2 mt-2">
      <div className="mb-1">
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Real Estate</span>
      </div>
      <div className="space-y-1">
        {/* Markers with per-source breakdown */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Markers</span>
          <span className="font-mono font-medium">{realEstate.propertyCount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground text-xs">Otodom</span>
          <span className="font-mono text-xs">{realEstate.propertyCountBySource.otodom.toLocaleString()}</span>
        </div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground text-xs">Gratka</span>
          <span className="font-mono text-xs">{realEstate.propertyCountBySource.gratka.toLocaleString()}</span>
        </div>
        
        {/* Clusters with per-source breakdown */}
        <div className="flex justify-between pt-1">
          <span className="text-muted-foreground">Clusters</span>
          <span className="font-mono font-medium">{realEstate.clusterCount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground text-xs">Otodom</span>
          <span className="font-mono text-xs">{realEstate.clusterCountBySource.otodom.toLocaleString()}</span>
        </div>
        <div className="flex justify-between pl-3">
          <span className="text-muted-foreground text-xs">Gratka</span>
          <span className="font-mono text-xs">{realEstate.clusterCountBySource.gratka.toLocaleString()}</span>
        </div>
        
        {/* Total Available */}
        <div className="flex justify-between pt-1">
          <span className="text-muted-foreground">Total Available</span>
          <span className="font-mono font-medium">{realEstate.totalCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
