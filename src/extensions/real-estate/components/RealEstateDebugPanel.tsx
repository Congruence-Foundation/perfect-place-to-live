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
    <div>
      <div className="text-muted-foreground font-medium mt-2 mb-1 border-t pt-2">
        Real Estate
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Properties</span>
        <span className="font-mono font-medium">{realEstate.propertyCount.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Clusters</span>
        <span className="font-mono font-medium">{realEstate.clusterCount.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Total Available</span>
        <span className="font-mono font-medium">{realEstate.totalCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
