'use client';

import { useTranslations } from 'next-intl';
import { FACTOR_PROFILES } from '@/config/factors';
import {
  Scale,
  Users,
  Briefcase,
  Laptop,
  Activity,
  Heart,
  GraduationCap,
  Gem,
} from 'lucide-react';

interface ProfileSelectorProps {
  selectedProfile: string | null;
  onProfileSelect: (profileId: string) => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  scale: Scale,
  users: Users,
  briefcase: Briefcase,
  laptop: Laptop,
  activity: Activity,
  heart: Heart,
  'graduation-cap': GraduationCap,
  gem: Gem,
};

export default function ProfileSelector({
  selectedProfile,
  onProfileSelect,
}: ProfileSelectorProps) {
  const t = useTranslations('profiles');

  return (
    <div className="grid grid-cols-4 gap-2">
      {FACTOR_PROFILES.map((profile) => {
        const IconComponent = ICON_MAP[profile.icon] || Scale;
        const isSelected = selectedProfile === profile.id;
        const profileName = t(`${profile.id}.name`);

        return (
          <button
            key={profile.id}
            type="button"
            onClick={() => onProfileSelect(profile.id)}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all ${
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
            title={t(`${profile.id}.description`)}
          >
            <IconComponent className={`h-5 w-5 ${isSelected ? '' : ''}`} />
            <span className="text-[10px] font-medium leading-tight text-center">
              {profileName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
