'use client';

import ExtensionsPanelList from './ExtensionsPanelList';

/**
 * ExtensionsBottomSheet Component
 * 
 * Renders all registered extension bottom sheet content dynamically for mobile.
 * Each extension can provide a BottomSheetContent component that will be rendered here.
 * The bottom sheet content is self-contained and manages its own state internally.
 */
export default function ExtensionsBottomSheet() {
  return <ExtensionsPanelList panelType="BottomSheetContent" className="pb-4" />;
}
