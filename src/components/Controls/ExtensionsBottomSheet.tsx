'use client';

import { useTranslations } from 'next-intl';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { getExtensionRegistry } from '@/extensions/registry';
// Import init to ensure extensions are registered
import '@/extensions/init';

/**
 * ExtensionsBottomSheet Component
 * 
 * Renders all registered extension bottom sheet content dynamically for mobile.
 * Each extension can provide a BottomSheetContent component that will be rendered here.
 * The bottom sheet content is self-contained and manages its own state internally.
 */
export default function ExtensionsBottomSheet() {
  const tControls = useTranslations('controls');
  const registry = getExtensionRegistry();
  const extensions = registry.getAll();

  return (
    <div className="pb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {tControls('extensions')}
        </span>
        <InfoTooltip>
          <p className="text-xs">{tControls('extensionsTooltip')}</p>
        </InfoTooltip>
      </div>
      
      {extensions.map((extension) => {
        const BottomSheetContent = extension.BottomSheetContent;
        if (!BottomSheetContent) return null;
        
        return (
          <div key={extension.id}>
            <BottomSheetContent />
          </div>
        );
      })}
    </div>
  );
}
