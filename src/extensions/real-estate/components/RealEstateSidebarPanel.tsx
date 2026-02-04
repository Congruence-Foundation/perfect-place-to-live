'use client';

import DataSourcesPanel from './DataSourcesPanel';
import { RealEstateFiltersContent } from './RealEstateFiltersContent';
import { useRealEstateExtension } from '../hooks';

/**
 * Real Estate Sidebar Panel Component
 * 
 * This component renders the real estate controls in the desktop sidebar.
 * Uses the shared RealEstateFiltersContent and adds desktop-specific DataSourcesPanel.
 */
export function RealEstateSidebarPanel() {
  const realEstate = useRealEstateExtension();

  return (
    <RealEstateFiltersContent>
      {/* Data Sources - desktop only */}
      <div className="mt-3">
        <DataSourcesPanel
          enabledSources={realEstate.dataSources}
          onSourcesChange={realEstate.setDataSources}
        />
      </div>
    </RealEstateFiltersContent>
  );
}
