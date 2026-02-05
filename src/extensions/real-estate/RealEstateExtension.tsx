'use client';

import type { MapExtension } from '@/extensions/types';
import { RealEstateSidebarPanel, RealEstateFiltersContent, RealEstateDebugPanel, RealEstateSettingsPanel } from './components';
import { RealEstateController } from './RealEstateController';

// Extension ID
export const REAL_ESTATE_EXTENSION_ID = 'real-estate';

/**
 * Create the real estate extension definition
 */
export function createRealEstateExtension(): MapExtension {
  return {
    id: REAL_ESTATE_EXTENSION_ID,
    name: 'Real Estate',
    description: 'Display property listings from multiple sources (Otodom, Gratka)',
    Controller: RealEstateController,
    SidebarPanel: RealEstateSidebarPanel,
    BottomSheetContent: RealEstateFiltersContent,
    DebugPanel: RealEstateDebugPanel,
    SettingsPanel: RealEstateSettingsPanel,
  };
}
