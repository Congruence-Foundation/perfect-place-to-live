'use client';

import { useTranslations } from 'next-intl';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { ScoreRangeSlider } from '@/components/Controls/ScoreRangeSlider';

interface ScoreRangeSectionProps {
  /** Current score range [min, max] */
  scoreRange: [number, number];
  /** Callback when score range changes */
  onScoreRangeChange: (range: [number, number]) => void;
}

/**
 * Score range filter section for real estate extension
 * Displays a slider to filter properties by location quality score
 */
export function ScoreRangeSection({ scoreRange, onScoreRangeChange }: ScoreRangeSectionProps) {
  const tRealEstate = useTranslations('realEstate');

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">{tRealEstate('scoreFilter')}</span>
        <InfoTooltip>
          <p className="text-xs">{tRealEstate('scoreFilterTooltip')}</p>
        </InfoTooltip>
      </div>
      <ScoreRangeSlider
        value={scoreRange}
        onChange={onScoreRangeChange}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{scoreRange[0]}%</span>
        <span className="text-[10px] text-muted-foreground">{scoreRange[1]}%</span>
      </div>
    </div>
  );
}
