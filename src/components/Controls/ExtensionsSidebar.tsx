'use client';

import ExtensionsPanelList from './ExtensionsPanelList';

/**
 * ExtensionsSidebar Component
 * 
 * Renders all registered extension sidebar panels dynamically.
 * Each extension can provide a SidebarPanel component that will be rendered here.
 * The sidebar panels are self-contained and manage their own state internally.
 */
export default function ExtensionsSidebar() {
  return <ExtensionsPanelList panelType="SidebarPanel" className="px-5 py-4" />;
}
