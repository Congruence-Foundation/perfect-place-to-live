'use client';

import { useRealEstateExtension } from '../hooks';
import type { PropertyDataSource } from '../config/filters';

/** Data sources to display in debug panel */
const DATA_SOURCES: { id: PropertyDataSource; label: string }[] = [
  { id: 'otodom', label: 'Otodom' },
  { id: 'gratka', label: 'Gratka' },
];

interface StatRowProps {
  label: string;
  value: number;
  isHeader?: boolean;
}

function StatRow({ label, value, isHeader = false }: StatRowProps) {
  return (
    <div className={`flex justify-between ${isHeader ? 'pt-1' : 'pl-3'}`}>
      <span className={`text-muted-foreground ${isHeader ? '' : 'text-xs'}`}>{label}</span>
      <span className={`font-mono ${isHeader ? 'font-medium' : 'text-xs'}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

interface StatGroupProps {
  label: string;
  total: number;
  bySource: Record<PropertyDataSource, number>;
}

function StatGroup({ label, total, bySource }: StatGroupProps) {
  return (
    <>
      <StatRow label={label} value={total} isHeader />
      {DATA_SOURCES.map(({ id, label }) => (
        <StatRow key={id} label={label} value={bySource[id]} />
      ))}
    </>
  );
}

/**
 * Real Estate Debug Panel Component
 * 
 * Self-contained component that renders debug info for the real estate extension.
 * Uses useRealEstateExtension hook internally to access state.
 */
export function RealEstateDebugPanel() {
  const realEstate = useRealEstateExtension();
  
  if (!realEstate.enabled) return null;
  
  return (
    <div className="border-t pt-2 mt-2">
      <div className="mb-1">
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Real Estate</span>
      </div>
      <div className="space-y-1">
        <StatGroup
          label="Markers"
          total={realEstate.propertyCount}
          bySource={realEstate.propertyCountBySource}
        />
        <StatGroup
          label="Clusters"
          total={realEstate.clusterCount}
          bySource={realEstate.clusterCountBySource}
        />
        <StatRow label="Total Available" value={realEstate.totalCount} isHeader />
      </div>
    </div>
  );
}
