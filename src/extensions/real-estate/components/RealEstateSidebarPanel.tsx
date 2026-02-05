'use client';

import { RealEstateFiltersContent } from './RealEstateFiltersContent';

/**
 * Real Estate Sidebar Panel Component
 * 
 * This component renders the real estate controls in the desktop sidebar.
 * Uses the shared RealEstateFiltersContent which includes all filters and DataSourcesPanel.
 */
export function RealEstateSidebarPanel() {
  return <RealEstateFiltersContent />;
}
