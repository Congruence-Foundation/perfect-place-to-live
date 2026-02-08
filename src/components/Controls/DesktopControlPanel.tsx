'use client';

import { useTranslations } from 'next-intl';
import WeightSliders from './WeightSliders';
import ProfileSelector from './ProfileSelector';
import ExtensionsSidebar from './ExtensionsSidebar';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import type { Factor } from '@/types';
import { Z_INDEX } from '@/constants/z-index';
import { FACTOR_PROFILES } from '@/config/factors';
import { CollapsibleFactorsSection } from './CollapsibleFactorsSection';

interface DesktopControlPanelProps {
  isPanelOpen: boolean;
  factors: Factor[];
  selectedProfile: string | null;
  isFactorsExpanded: boolean;
  enabledFactorCount: number;
  onFactorChange: (factorId: string, updates: Partial<Factor>) => void;
  onProfileSelect: (profileId: string) => void;
  onResetFactors: () => void;
  onToggleFactorsExpanded: () => void;
}

/**
 * Desktop control panel with profiles, factors, and extensions
 */
export function DesktopControlPanel({
  isPanelOpen,
  factors,
  selectedProfile,
  isFactorsExpanded,
  enabledFactorCount,
  onFactorChange,
  onProfileSelect,
  onResetFactors,
  onToggleFactorsExpanded,
}: DesktopControlPanelProps) {
  const tApp = useTranslations('app');
  const tControls = useTranslations('controls');
  const tProfiles = useTranslations('profiles');

  const currentProfile = FACTOR_PROFILES.find(p => p.id === selectedProfile);

  return (
    <div
      className={`${
        isPanelOpen ? 'w-80' : 'w-0'
      } transition-all duration-300 flex-shrink-0 overflow-hidden bg-background/95 backdrop-blur-sm relative`}
      style={{ zIndex: Z_INDEX.CONTROL_PANEL }}
    >
      <div className="w-80 h-full overflow-y-auto scrollbar-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{tApp('title')}</h1>
          <InfoTooltip>
            <p className="text-xs">{tApp('description')}</p>
          </InfoTooltip>
        </div>

        {/* Profiles Section */}
        <div className="px-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tControls('profile')}</span>
          </div>
          <ProfileSelector
            selectedProfile={selectedProfile}
            onProfileSelect={onProfileSelect}
          />
          {currentProfile && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {tProfiles(`${currentProfile.id}.description`)}
            </p>
          )}
        </div>

        {/* Factors Section - Collapsible */}
        <div className="px-5 pb-4">
          <CollapsibleFactorsSection
            isExpanded={isFactorsExpanded}
            onToggleExpanded={onToggleFactorsExpanded}
            enabledFactorCount={enabledFactorCount}
            onReset={onResetFactors}
          >
            <WeightSliders factors={factors} onFactorChange={onFactorChange} />
          </CollapsibleFactorsSection>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t" />

        {/* Extensions Section */}
        <ExtensionsSidebar />
      </div>
    </div>
  );
}
