'use client';

import type { MapExtension } from '@/extensions/types';
import { RealEstateSidebarPanel, RealEstateBottomSheetContent, RealEstateDebugPanel, RealEstateSettingsPanel } from './components';
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
    description: 'Display property listings from Otodom on the map',
    Controller: RealEstateController,
    SidebarPanel: RealEstateSidebarPanel,
    BottomSheetContent: RealEstateBottomSheetContent,
    DebugPanel: RealEstateDebugPanel,
    SettingsPanel: RealEstateSettingsPanel,
  };
}
