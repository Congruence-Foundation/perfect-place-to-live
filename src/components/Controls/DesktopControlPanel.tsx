'use client';

import { useTranslations } from 'next-intl';
import { WeightSliders, ProfileSelector, ExtensionsSidebar } from '@/components/Controls';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import type { Factor } from '@/types';
import { SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';
import { Z_INDEX } from '@/constants/z-index';
import { FACTOR_PROFILES } from '@/config/factors';

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
          <div className={`rounded-xl bg-muted/50 transition-colors ${isFactorsExpanded ? '' : 'hover:bg-muted'}`}>
            {/* Header - always visible */}
            <div className="flex items-center justify-between p-3">
              <button
                onClick={onToggleFactorsExpanded}
                className="flex items-center gap-3 flex-1"
              >
                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shadow-sm">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-medium block">{tControls('factors')}</span>
                  <span className="text-xs text-muted-foreground">{tControls('active', { count: enabledFactorCount })}</span>
                </div>
              </button>
              <div className="flex items-center gap-1">
                {isFactorsExpanded && (
                  <Button variant="ghost" size="sm" onClick={onResetFactors} className="h-7 px-2 text-xs animate-in fade-in slide-in-from-right-2 duration-200">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {tControls('reset')}
                  </Button>
                )}
                <button
                  onClick={onToggleFactorsExpanded}
                  className="p-1 hover:bg-background/50 rounded transition-colors"
                >
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isFactorsExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* Expanded content - inside the panel */}
            {isFactorsExpanded && (
              <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="border-t border-background/50 pt-3">
                  {/* Factor Sliders */}
                  <WeightSliders factors={factors} onFactorChange={onFactorChange} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t" />

        {/* Extensions Section */}
        <ExtensionsSidebar />
      </div>
    </div>
  );
}
