'use client';

import { useTranslations } from 'next-intl';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { getExtensionRegistry } from '@/extensions/registry';
// Import init to ensure extensions are registered
import '@/extensions/init';

/**
 * ExtensionsSidebar Component
 * 
 * Renders all registered extension sidebar panels dynamically.
 * Each extension can provide a SidebarPanel component that will be rendered here.
 * The sidebar panels are self-contained and manage their own state internally.
 */
export default function ExtensionsSidebar() {
  const tControls = useTranslations('controls');
  const registry = getExtensionRegistry();
  const extensions = registry.getAll();

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {tControls('extensions')}
        </span>
        <InfoTooltip>
          <p className="text-xs">{tControls('extensionsTooltip')}</p>
        </InfoTooltip>
      </div>
      
      {extensions.map((extension) => {
        const SidebarPanel = extension.SidebarPanel;
        if (!SidebarPanel) return null;
        
        return (
          <div key={extension.id}>
            <SidebarPanel />
          </div>
        );
      })}
    </div>
  );
}
