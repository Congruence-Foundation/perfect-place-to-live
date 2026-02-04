'use client';

import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import type { HeatmapSettings, ClusterPriceAnalysisMode } from '@/types';
import type { ClusterPriceDisplay } from '../types';
import { useRealEstateExtension } from '../hooks';
import { useRealEstateStore } from '../store';
import { Z_INDEX } from '@/constants/z-index';
import {
  DETAILED_THRESHOLD_MIN,
  DETAILED_THRESHOLD_MAX,
  DETAILED_THRESHOLD_STEP,
} from '../config/constants';

const CLUSTER_PRICE_VALUES: ClusterPriceDisplay[] = ['none', 'range', 'median', 'median_spread'];
const CLUSTER_ANALYSIS_VALUES: ClusterPriceAnalysisMode[] = ['off', 'simplified', 'detailed'];
const PRICE_RADIUS_VALUES = [0, 1, 2] as const;

interface SettingSelectProps<T extends string> {
  label: string;
  tooltip: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  getLabel: (value: T) => string;
}

function SettingSelect<T extends string>({ 
  label, 
  tooltip, 
  value, 
  options, 
  onChange, 
  getLabel 
}: SettingSelectProps<T>) {
  return (
    <div className="flex items-center justify-between">
      <LabelWithTooltip label={label} tooltip={tooltip} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" style={{ zIndex: Z_INDEX.DROPDOWN }}>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {getLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  
  if (!realEstate.enabled) return null;
  
  return (
    <>
      <SettingSelect
        label={t('priceAnalysisRadius')}
        tooltip={t('priceAnalysisRadiusTooltip')}
        value={priceAnalysisRadius.toString()}
        options={PRICE_RADIUS_VALUES.map(v => v.toString())}
        onChange={(value) => setPriceAnalysisRadius(parseInt(value, 10))}
        getLabel={(value) => t(`priceAnalysisRadius_${value}`)}
      />

      <SettingSelect
        label={t('clusterPrice')}
        tooltip={t('clusterPriceTooltip')}
        value={settings.clusterPriceDisplay}
        options={CLUSTER_PRICE_VALUES}
        onChange={(value: ClusterPriceDisplay) => onSettingsChange({ clusterPriceDisplay: value })}
        getLabel={(value) => t(`clusterPrice_${value}`)}
      />

      <SettingSelect
        label={t('clusterAnalysis')}
        tooltip={t('clusterAnalysisTooltip')}
        value={settings.clusterPriceAnalysis}
        options={CLUSTER_ANALYSIS_VALUES}
        onChange={(value: ClusterPriceAnalysisMode) => onSettingsChange({ clusterPriceAnalysis: value })}
        getLabel={(value) => t(`clusterAnalysis_${value}`)}
      />

      {/* Detailed Mode Threshold - Only show when detailed mode is selected */}
      {settings.clusterPriceAnalysis === 'detailed' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <LabelWithTooltip
              label={t('detailedThreshold')}
              tooltip={t('detailedThresholdTooltip')}
            />
            <span className="text-xs text-muted-foreground font-medium">{settings.detailedModeThreshold}</span>
          </div>
          <Slider
            value={[settings.detailedModeThreshold]}
            onValueChange={([value]) => onSettingsChange({ detailedModeThreshold: value })}
            min={DETAILED_THRESHOLD_MIN}
            max={DETAILED_THRESHOLD_MAX}
            step={DETAILED_THRESHOLD_STEP}
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
