'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings, Eye, EyeOff, Database, Grid3X3 } from 'lucide-react';
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
import { PanelHeader } from '@/components/ui/panel-header';
import type { HeatmapSettings, DistanceCurve } from '@/types';
import { ExtensionsSettingsPanel } from './ExtensionsSettingsPanel';
import { PanelToggleButton } from './PanelToggleButton';
import { FloatingPanel } from './FloatingPanel';
import { useMapStore } from '@/stores/mapStore';
import { Z_INDEX } from '@/constants/z-index';

const CURVE_VALUES: DistanceCurve[] = ['log', 'linear', 'exp', 'power'];
const HEATMAP_RADIUS_VALUES = [0, 1, 2] as const;
const POI_BUFFER_SCALE_VALUES = [1, 1.5, 2] as const;

interface MapSettingsProps {
  settings: HeatmapSettings;
  onSettingsChange: (settings: Partial<HeatmapSettings>) => void;
  showPOIs: boolean;
  onShowPOIsChange: (show: boolean) => void;
  useOverpassAPI?: boolean;
  onUseOverpassAPIChange?: (use: boolean) => void;
  isMobile?: boolean;
}

export default function MapSettings({
  settings,
  onSettingsChange,
  showPOIs,
  onShowPOIsChange,
  useOverpassAPI = false,
  onUseOverpassAPIChange,
  isMobile = false,
}: MapSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('settings');
  const tCurves = useTranslations('curves');
  
  // Get heatmap tile radius from store
  const heatmapTileRadius = useMapStore((s) => s.heatmapTileRadius);
  const setHeatmapTileRadius = useMapStore((s) => s.setHeatmapTileRadius);
  
  // Get POI buffer scale from store
  const poiBufferScale = useMapStore((s) => s.poiBufferScale);
  const setPoiBufferScale = useMapStore((s) => s.setPoiBufferScale);
  
  // Debug: tile borders
  const showHeatmapTileBorders = useMapStore((s) => s.showHeatmapTileBorders);
  const setShowHeatmapTileBorders = useMapStore((s) => s.setShowHeatmapTileBorders);
  const showPropertyTileBorders = useMapStore((s) => s.showPropertyTileBorders);
  const setShowPropertyTileBorders = useMapStore((s) => s.setShowPropertyTileBorders);

  return (
    <div 
      className={isMobile ? 'relative' : 'absolute bottom-4 right-4'}
      style={{ zIndex: Z_INDEX.FLOATING_CONTROLS }}
    >
      <FloatingPanel
        isOpen={isOpen}
        position="bottom-right"
        width="w-64"
        mobileScrollable={isMobile}
      >
        <PanelHeader title={t('title')} onClose={() => setIsOpen(false)} className="mb-4" />

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
              <SelectContent position="popper" className="w-64" style={{ zIndex: Z_INDEX.DROPDOWN }}>
                {CURVE_VALUES.map((curveValue) => (
                  <SelectItem key={curveValue} value={curveValue} className="text-xs py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tCurves(`${curveValue}.label`)}</span>
                      <InfoTooltip 
                        contentStyle={{ zIndex: Z_INDEX.NESTED_DROPDOWN }}
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

          {/* Heatmap Area */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs">{t('heatmapArea')}</Label>
              <InfoTooltip>
                <p className="text-xs">{t('heatmapAreaTooltip')}</p>
              </InfoTooltip>
            </div>
            <Select
              value={String(heatmapTileRadius)}
              onValueChange={(value) => setHeatmapTileRadius(Number(value))}
            >
              <SelectTrigger className="h-7 text-xs w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" style={{ zIndex: Z_INDEX.DROPDOWN }}>
                {HEATMAP_RADIUS_VALUES.map((radiusValue) => (
                  <SelectItem key={radiusValue} value={String(radiusValue)} className="text-xs">
                    {t(`heatmapArea_${radiusValue}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* POI Buffer Scale */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs">{t('poiBuffer')}</Label>
              <InfoTooltip>
                <p className="text-xs">{t('poiBufferTooltip')}</p>
              </InfoTooltip>
            </div>
            <Select
              value={String(poiBufferScale)}
              onValueChange={(value) => setPoiBufferScale(Number(value))}
            >
              <SelectTrigger className="h-7 text-xs w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" style={{ zIndex: Z_INDEX.DROPDOWN }}>
                {POI_BUFFER_SCALE_VALUES.map((scaleValue) => (
                  <SelectItem key={scaleValue} value={String(scaleValue)} className="text-xs">
                    {t(`poiBuffer_${String(scaleValue).replace('.', '_')}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Extension Settings Panels - Self-contained */}
          <ExtensionsSettingsPanel 
            settings={settings} 
            onSettingsChange={onSettingsChange} 
          />

          {/* Debug: Tile Borders */}
          <div className="pt-2 border-t border-dashed">
            <div className="flex items-center gap-1 mb-2">
              <Grid3X3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Debug</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Heatmap tiles</Label>
                  <InfoTooltip>
                    <p className="text-xs">Shows tile boundaries used for heatmap calculation (zoom level 13 tiles)</p>
                  </InfoTooltip>
                </div>
                <Switch
                  checked={showHeatmapTileBorders}
                  onCheckedChange={setShowHeatmapTileBorders}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Property tiles</Label>
                  <InfoTooltip>
                    <p className="text-xs">Shows tile boundaries used for property fetching (requires zoom 14+)</p>
                  </InfoTooltip>
                </div>
                <Switch
                  checked={showPropertyTileBorders}
                  onCheckedChange={setShowPropertyTileBorders}
                />
              </div>
            </div>
          </div>
        </div>
      </FloatingPanel>

      {/* Toggle Button */}
      <PanelToggleButton
        Icon={Settings}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        title={t('title')}
      />
    </div>
  );
}
