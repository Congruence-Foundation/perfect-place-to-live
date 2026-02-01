'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings, X, Eye, EyeOff, Database } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { HeatmapSettings } from '@/types';
import { DistanceCurve } from '@/types';

const CURVE_VALUES: DistanceCurve[] = ['log', 'linear', 'exp', 'power'];

interface MapSettingsProps {
  settings: HeatmapSettings;
  onSettingsChange: (settings: Partial<HeatmapSettings>) => void;
  showPOIs: boolean;
  onShowPOIsChange: (show: boolean) => void;
  mode: 'realtime' | 'precomputed';
  onModeChange: (mode: 'realtime' | 'precomputed') => void;
  useOverpassAPI?: boolean;
  onUseOverpassAPIChange?: (use: boolean) => void;
  isMobile?: boolean;
}

export default function MapSettings({
  settings,
  onSettingsChange,
  showPOIs,
  onShowPOIsChange,
  mode,
  onModeChange,
  useOverpassAPI = false,
  onUseOverpassAPIChange,
  isMobile = false,
}: MapSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('settings');
  const tCurves = useTranslations('curves');

  return (
    <div className={`${
      isMobile ? 'relative' : 'absolute bottom-4 right-4'
    } z-[1000]`}>
      {/* Expanded Panel - Absolutely positioned above the button */}
      {isOpen && (
        <div className={`absolute bottom-12 right-0 bg-background/95 backdrop-blur-sm rounded-2xl shadow-lg border p-4 w-64 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
          isMobile ? 'max-h-[50vh] overflow-y-auto' : ''
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold">{t('title')}</span>
            <button
              onClick={() => setIsOpen(false)}
              className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Show POIs */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label className="text-xs flex items-center gap-2">
                  {showPOIs ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {t('showPOIs')}
                </Label>
                <InfoTooltip>
                  <p className="text-xs">{t('showPOIsTooltip')}</p>
                </InfoTooltip>
              </div>
              <Switch
                checked={showPOIs}
                onCheckedChange={onShowPOIsChange}
              />
            </div>

            {/* Grid Resolution */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">{t('gridResolution')}</Label>
                  <InfoTooltip>
                    <p className="text-xs">{t('gridResolutionTooltip')}</p>
                  </InfoTooltip>
                </div>
                <span className="text-xs text-muted-foreground font-medium">{settings.gridCellSize}m</span>
              </div>
              <Slider
                value={[settings.gridCellSize]}
                onValueChange={([value]) => onSettingsChange({ gridCellSize: value })}
                min={25}
                max={300}
                step={25}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{t('dense')}</span>
                <span>{t('fast')}</span>
              </div>
            </div>

            {/* Distance Curve - Inline */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label className="text-xs">{t('curve')}</Label>
                <InfoTooltip>
                  <p className="text-xs">{t('curveTooltip')}</p>
                </InfoTooltip>
              </div>
              <Select
                value={settings.distanceCurve}
                onValueChange={(value: DistanceCurve) => onSettingsChange({ distanceCurve: value })}
              >
                <SelectTrigger className="h-7 text-xs w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[1100] w-64">
                  {CURVE_VALUES.map((curveValue) => (
                    <SelectItem key={curveValue} value={curveValue} className="text-xs py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tCurves(`${curveValue}.label`)}</span>
                        <InfoTooltip 
                          contentClassName="z-[1200]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-xs font-medium mb-1">{tCurves(`${curveValue}.description`)}</p>
                          <p className="text-xs text-muted-foreground">{tCurves(`${curveValue}.useCase`)}</p>
                        </InfoTooltip>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sensitivity Slider - Only show for non-linear curves */}
            {settings.distanceCurve !== 'linear' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{t('sensitivity')}</Label>
                    <InfoTooltip>
                      <p className="text-xs">{t('sensitivityTooltip')}</p>
                    </InfoTooltip>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{settings.sensitivity.toFixed(1)}x</span>
                </div>
                <Slider
                  value={[settings.sensitivity]}
                  onValueChange={([value]) => onSettingsChange({ sensitivity: value })}
                  min={0.5}
                  max={3}
                  step={0.5}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{t('gentle')}</span>
                  <span>{t('aggressive')}</span>
                </div>
              </div>
            )}

            {/* Normalize to Viewport */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">{t('relativeMode')}</Label>
                  <InfoTooltip>
                    <p className="text-xs">{t('relativeModeTooltip')}</p>
                  </InfoTooltip>
                </div>
                <Switch
                  checked={settings.normalizeToViewport}
                  onCheckedChange={(checked) => onSettingsChange({ normalizeToViewport: checked })}
                />
              </div>
            </div>

            {/* Computation Mode */}
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label className="text-xs">{t('computation')}</Label>
                <InfoTooltip>
                  <p className="text-xs">{t('computationTooltip')}</p>
                </InfoTooltip>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={mode === 'realtime' ? 'font-medium' : 'text-muted-foreground'}>
                  {t('realtime')}
                </span>
                <Switch
                  checked={mode === 'precomputed'}
                  onCheckedChange={(checked) => onModeChange(checked ? 'precomputed' : 'realtime')}
                />
                <span className={mode === 'precomputed' ? 'font-medium' : 'text-muted-foreground'}>
                  {t('cached')}
                </span>
              </div>
              {mode === 'precomputed' && (
                <p className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg">
                  {t('cachedNotAvailable')}
                </p>
              )}
            </div>

            {/* Data Source Toggle - Overpass API (disabled by default) */}
            {onUseOverpassAPIChange && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs flex items-center gap-2">
                      <Database className="h-3.5 w-3.5" />
                      {t('useOverpass')}
                    </Label>
                    <InfoTooltip>
                      <p className="text-xs">{t('useOverpassTooltip')}</p>
                    </InfoTooltip>
                  </div>
                  <Switch
                    checked={useOverpassAPI}
                    onCheckedChange={onUseOverpassAPIChange}
                  />
                </div>
                {useOverpassAPI && (
                  <p className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg">
                    Using Overpass API - slower but real-time data
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all ${
          isOpen 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-background/95 backdrop-blur-sm hover:bg-muted border'
        }`}
        title={t('title')}
      >
        <Settings className={`h-5 w-5 ${isOpen ? '' : 'text-muted-foreground'}`} />
      </button>
    </div>
  );
}
