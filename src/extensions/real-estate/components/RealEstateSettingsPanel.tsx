'use client';

import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { HeatmapSettings, ClusterPriceAnalysisMode } from '@/types';
import { ClusterPriceDisplay } from '../types';
import { useRealEstateExtension } from '../hooks';
import { useRealEstateStore } from '../store';
import { Z_INDEX } from '@/constants/z-index';

const CLUSTER_PRICE_VALUES: ClusterPriceDisplay[] = ['none', 'range', 'median', 'median_spread'];
const CLUSTER_ANALYSIS_VALUES: ClusterPriceAnalysisMode[] = ['off', 'simplified', 'detailed'];

// Price analysis radius options (values only, labels come from translations)
const PRICE_RADIUS_VALUES = [0, 1, 2] as const;

interface RealEstateSettingsPanelProps {
  settings: HeatmapSettings;
  onSettingsChange: (settings: Partial<HeatmapSettings>) => void;
}

/**
 * Real Estate Settings Panel Component
 * 
 * Self-contained component that renders settings for the real estate extension.
 * Uses useRealEstateExtension hook internally to check if extension is enabled.
 */
export function RealEstateSettingsPanel({ settings, onSettingsChange }: RealEstateSettingsPanelProps) {
  const t = useTranslations('settings');
  const realEstate = useRealEstateExtension();
  const priceAnalysisRadius = useRealEstateStore((s) => s.priceAnalysisRadius);
  const setPriceAnalysisRadius = useRealEstateStore((s) => s.setPriceAnalysisRadius);
  
  // Don't render anything if extension is not enabled
  if (!realEstate.enabled) return null;
  
  return (
    <>
      {/* Price Analysis Radius */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Label className="text-xs">{t('priceAnalysisRadius')}</Label>
          <InfoTooltip>
            <p className="text-xs">{t('priceAnalysisRadiusTooltip')}</p>
          </InfoTooltip>
        </div>
        <Select
          value={priceAnalysisRadius.toString()}
          onValueChange={(value) => setPriceAnalysisRadius(parseInt(value, 10))}
        >
          <SelectTrigger className="h-7 text-xs w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className={`z-[${Z_INDEX.DROPDOWN}]`}>
            {PRICE_RADIUS_VALUES.map((value) => (
              <SelectItem key={value} value={value.toString()} className="text-xs">
                {t(`priceAnalysisRadius_${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cluster Price Display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Label className="text-xs">{t('clusterPrice')}</Label>
          <InfoTooltip>
            <p className="text-xs">{t('clusterPriceTooltip')}</p>
          </InfoTooltip>
        </div>
        <Select
          value={settings.clusterPriceDisplay}
          onValueChange={(value: ClusterPriceDisplay) => onSettingsChange({ clusterPriceDisplay: value })}
        >
          <SelectTrigger className="h-7 text-xs w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className={`z-[${Z_INDEX.DROPDOWN}]`}>
            {CLUSTER_PRICE_VALUES.map((displayValue) => (
              <SelectItem key={displayValue} value={displayValue} className="text-xs">
                {t(`clusterPrice_${displayValue}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cluster Price Analysis */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Label className="text-xs">{t('clusterAnalysis')}</Label>
          <InfoTooltip>
            <p className="text-xs">{t('clusterAnalysisTooltip')}</p>
          </InfoTooltip>
        </div>
        <Select
          value={settings.clusterPriceAnalysis}
          onValueChange={(value: ClusterPriceAnalysisMode) => onSettingsChange({ clusterPriceAnalysis: value })}
        >
          <SelectTrigger className="h-7 text-xs w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className={`z-[${Z_INDEX.DROPDOWN}]`}>
            {CLUSTER_ANALYSIS_VALUES.map((analysisValue) => (
              <SelectItem key={analysisValue} value={analysisValue} className="text-xs">
                {t(`clusterAnalysis_${analysisValue}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Detailed Mode Threshold - Only show when detailed mode is selected */}
      {settings.clusterPriceAnalysis === 'detailed' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs">{t('detailedThreshold')}</Label>
              <InfoTooltip>
                <p className="text-xs">{t('detailedThresholdTooltip')}</p>
              </InfoTooltip>
            </div>
            <span className="text-xs text-muted-foreground font-medium">{settings.detailedModeThreshold}</span>
          </div>
          <Slider
            value={[settings.detailedModeThreshold]}
            onValueChange={([value]) => onSettingsChange({ detailedModeThreshold: value })}
            min={20}
            max={500}
            step={20}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{t('fewClusters')}</span>
            <span>{t('manyClusters')}</span>
          </div>
        </div>
      )}
    </>
  );
}
