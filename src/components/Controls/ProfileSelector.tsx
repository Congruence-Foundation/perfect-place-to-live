'use client';

import { useTranslations } from 'next-intl';
import { FACTOR_PROFILES } from '@/config/factors';
import { PROFILE_ICON_MAP, DEFAULT_PROFILE_ICON } from '@/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ProfileSelectorProps {
  selectedProfile: string | null;
  onProfileSelect: (profileId: string) => void;
}

export default function ProfileSelector({
  selectedProfile,
  onProfileSelect,
}: ProfileSelectorProps) {
  const t = useTranslations('profiles');

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {FACTOR_PROFILES.map((profile) => {
        const IconComponent = PROFILE_ICON_MAP[profile.icon] || DEFAULT_PROFILE_ICON;
        const isSelected = selectedProfile === profile.id;
        const profileName = t(`${profile.id}.name`);
        const profileDescription = t(`${profile.id}.description`);

        return (
          <Tooltip key={profile.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onProfileSelect(profile.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={isSelected}
                aria-label={`${profileName}: ${profileDescription}`}
              >
                <IconComponent className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-tight text-center">
                  {profileName}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[200px]">
              <p className="font-medium">{profileName}</p>
              <p className="text-xs opacity-80">{profileDescription}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
