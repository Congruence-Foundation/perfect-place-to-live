'use client';

import { useTranslations } from 'next-intl';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { getExtensions } from '@/extensions/utils';
import type { MapExtension } from '@/extensions/types';

type PanelType = 'SidebarPanel' | 'BottomSheetContent';

interface ExtensionsPanelListProps {
  /** Which panel component to render from each extension */
  panelType: PanelType;
  /** Container className for the wrapper div */
  className?: string;
}

/**
 * ExtensionsPanelList Component
 * 
 * Generic component that renders extension panels dynamically.
 * Used by both ExtensionsSidebar and ExtensionsBottomSheet to avoid duplication.
 * Each extension can provide a SidebarPanel or BottomSheetContent component.
 */
export default function ExtensionsPanelList({ 
  panelType, 
  className = 'pb-4' 
}: ExtensionsPanelListProps) {
  const tControls = useTranslations('controls');
  const extensions = getExtensions();

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {tControls('extensions')}
        </span>
        <InfoTooltip>
          <p className="text-xs">{tControls('extensionsTooltip')}</p>
        </InfoTooltip>
      </div>
      
      {extensions.map((extension: MapExtension) => {
        const PanelComponent = extension[panelType];
        if (!PanelComponent) return null;
        
        return (
          <div key={extension.id}>
            <PanelComponent />
          </div>
        );
      })}
    </div>
  );
}
