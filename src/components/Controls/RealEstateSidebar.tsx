'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Search, ChevronDown, ChevronUp, Home, Building2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RangeInput, ToggleButtonGroup, FilterSelect } from './filters';
import {
  PropertyFilters,
  RoomCount,
  EstateType,
  MarketType,
  OwnerType,
  FloorLevel,
  FlatBuildingType,
  HouseBuildingType,
  BuildingMaterial,
  PropertyExtra,
} from '@/types/property';
import {
  ROOM_OPTIONS,
  FLOOR_OPTIONS,
  FLAT_BUILDING_TYPE_OPTIONS,
  HOUSE_BUILDING_TYPE_OPTIONS,
  COMMON_BUILDING_MATERIALS,
  EXTRAS_OPTIONS,
  LISTING_AGE_OPTIONS,
  MARKET_OPTIONS,
  OWNER_TYPE_OPTIONS,
  TranslatableFilterOption,
} from '@/config/filters';

interface RealEstateSidebarProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: Partial<PropertyFilters>) => void;
  propertyCount?: number;
  isLoading?: boolean;
  error?: string | null;
}

/**
 * Helper to translate filter options
 */
function useTranslatedOptions<T extends string>(
  options: TranslatableFilterOption<T>[],
  t: (key: string) => string
): { value: T; label: string }[] {
  return options.map((opt) => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));
}

export default function RealEstateSidebar({
  filters,
  onFiltersChange,
  propertyCount,
  isLoading,
  error,
}: RealEstateSidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const t = useTranslations('realEstate');

  // Translated options
  const floorOptions = useTranslatedOptions(FLOOR_OPTIONS, t);
  const flatBuildingOptions = useTranslatedOptions(FLAT_BUILDING_TYPE_OPTIONS, t);
  const houseBuildingOptions = useTranslatedOptions(HOUSE_BUILDING_TYPE_OPTIONS, t);
  const materialOptions = useTranslatedOptions(COMMON_BUILDING_MATERIALS, t);
  const extrasOptions = useTranslatedOptions(EXTRAS_OPTIONS, t);
  const listingAgeOptions = useTranslatedOptions(LISTING_AGE_OPTIONS, t);
  const marketOptions = useTranslatedOptions(MARKET_OPTIONS, t);
  const ownerTypeOptions = useTranslatedOptions(OWNER_TYPE_OPTIONS, t);

  // Generic array toggle handler
  const createArrayToggle = useCallback(
    <T,>(key: keyof PropertyFilters) =>
      (values: T[]) => {
        onFiltersChange({ [key]: values.length > 0 ? values : undefined });
      },
    [onFiltersChange]
  );

  // Handlers for array-based filters
  const handleRoomsChange = createArrayToggle<RoomCount>('roomsNumber');
  const handleFloorsChange = createArrayToggle<FloorLevel>('floors');
  const handleFlatBuildingTypeChange = createArrayToggle<FlatBuildingType>('flatBuildingType');
  const handleHouseBuildingTypeChange = createArrayToggle<HouseBuildingType>('houseBuildingType');
  const handleMaterialChange = createArrayToggle<BuildingMaterial>('buildingMaterial');
  const handleExtrasChange = createArrayToggle<PropertyExtra>('extras');

  const handleEstateChange = (estate: EstateType) => {
    onFiltersChange({
      estate,
      // Reset estate-specific filters
      floors: undefined,
      flatBuildingType: undefined,
      floorsNumberMin: undefined,
      floorsNumberMax: undefined,
      terrainAreaMin: undefined,
      terrainAreaMax: undefined,
      houseBuildingType: undefined,
      isBungalow: undefined,
    });
  };

  const getStatusText = () => {
    if (isLoading) return t('loading');
    if (error) return t('error');
    if (propertyCount !== undefined) {
      return propertyCount === 0 ? t('noResults') : t('properties', { count: propertyCount });
    }
    return '';
  };

  return (
    <div className="rounded-xl bg-muted/50 transition-colors">
      {/* Header - always visible */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-primary text-primary-foreground">
            <Search className="h-4 w-4" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium block">{t('searchCriteria')}</span>
            <span className="text-xs text-muted-foreground">{getStatusText()}</span>
          </div>
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-background/50 rounded transition-colors"
        >
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-background/50 pt-3 space-y-4">
            {/* Estate Type Toggle */}
            <div className="space-y-2">
              <Label className="text-xs">{t('estateType')}</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEstateChange('FLAT')}
                  className={`flex-1 flex items-center justify-center gap-2 h-8 rounded border text-xs transition-colors ${
                    filters.estate === 'FLAT'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {t('flat')}
                </button>
                <button
                  onClick={() => handleEstateChange('HOUSE')}
                  className={`flex-1 flex items-center justify-center gap-2 h-8 rounded border text-xs transition-colors ${
                    filters.estate === 'HOUSE'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-input'
                  }`}
                >
                  <Home className="h-3.5 w-3.5" />
                  {t('house')}
                </button>
              </div>
            </div>

            {/* Price Range */}
            <RangeInput
              label={t('priceRange')}
              unit="PLN"
              minValue={filters.priceMin}
              maxValue={filters.priceMax}
              minPlaceholder={t('priceMin')}
              maxPlaceholder={t('priceMax')}
              onMinChange={(v) => onFiltersChange({ priceMin: v })}
              onMaxChange={(v) => onFiltersChange({ priceMax: v })}
            />

            {/* Rooms */}
            <ToggleButtonGroup
              label={t('rooms')}
              options={ROOM_OPTIONS}
              selected={filters.roomsNumber || []}
              onChange={handleRoomsChange}
              size="md"
            />

            {/* Area Range */}
            <RangeInput
              label={t('area')}
              unit="m²"
              minValue={filters.areaMin}
              maxValue={filters.areaMax}
              onMinChange={(v) => onFiltersChange({ areaMin: v })}
              onMaxChange={(v) => onFiltersChange({ areaMax: v })}
            />

            {/* Market Type & Listing Age - side by side */}
            <div className="flex items-start gap-6">
              <FilterSelect
                label={t('market')}
                options={marketOptions}
                value={filters.market || 'ALL'}
                onChange={(v) => onFiltersChange({ market: v as MarketType })}
                width="w-[45%]"
              />
              <FilterSelect
                label={t('listingAge')}
                options={listingAgeOptions}
                value={filters.daysSinceCreated || 'any'}
                onChange={(v) =>
                  onFiltersChange({
                    daysSinceCreated: v === 'any' ? undefined : (v as PropertyFilters['daysSinceCreated']),
                  })
                }
                width="flex-1"
                placeholder={t('listingAgeAny')}
              />
            </div>

            {/* Advanced Filters Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>{t('advancedFilters')}</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4 pl-2 border-l-2 border-muted">
                {/* Build Year */}
                <RangeInput
                  label={t('buildYear')}
                  minValue={filters.buildYearMin}
                  maxValue={filters.buildYearMax}
                  onMinChange={(v) => onFiltersChange({ buildYearMin: v })}
                  onMaxChange={(v) => onFiltersChange({ buildYearMax: v })}
                />

                {/* Building Type */}
                <ToggleButtonGroup
                  label={t('buildingType')}
                  options={filters.estate === 'FLAT' ? flatBuildingOptions : houseBuildingOptions}
                  selected={
                    filters.estate === 'FLAT'
                      ? filters.flatBuildingType || []
                      : filters.houseBuildingType || []
                  }
                  onChange={(values) => {
                    if (filters.estate === 'FLAT') {
                      handleFlatBuildingTypeChange(values as FlatBuildingType[]);
                    } else {
                      handleHouseBuildingTypeChange(values as HouseBuildingType[]);
                    }
                  }}
                />

                {/* Building Material */}
                <ToggleButtonGroup
                  label={t('buildingMaterial')}
                  options={materialOptions}
                  selected={filters.buildingMaterial || []}
                  onChange={handleMaterialChange}
                />

                {/* Price per m² */}
                <RangeInput
                  label={t('pricePerMeter')}
                  unit="PLN/m²"
                  minValue={filters.pricePerMeterMin}
                  maxValue={filters.pricePerMeterMax}
                  onMinChange={(v) => onFiltersChange({ pricePerMeterMin: v })}
                  onMaxChange={(v) => onFiltersChange({ pricePerMeterMax: v })}
                />

                {/* Owner Type */}
                <FilterSelect
                  label={t('ownerType')}
                  options={ownerTypeOptions}
                  value={filters.ownerType || 'ALL'}
                  onChange={(v) => onFiltersChange({ ownerType: v as OwnerType })}
                  width="w-[50%]"
                />

                {/* FLAT-specific: Floor Level */}
                {filters.estate === 'FLAT' && (
                  <ToggleButtonGroup
                    label={t('floorLevel')}
                    options={floorOptions}
                    selected={filters.floors || []}
                    onChange={handleFloorsChange}
                  />
                )}

                {/* FLAT-specific: Number of floors in building */}
                {filters.estate === 'FLAT' && (
                  <RangeInput
                    label={t('floorsInBuilding')}
                    minValue={filters.floorsNumberMin}
                    maxValue={filters.floorsNumberMax}
                    onMinChange={(v) => onFiltersChange({ floorsNumberMin: v })}
                    onMaxChange={(v) => onFiltersChange({ floorsNumberMax: v })}
                  />
                )}

                {/* HOUSE-specific: Terrain/Plot Area */}
                {filters.estate === 'HOUSE' && (
                  <RangeInput
                    label={t('terrainArea')}
                    unit="m²"
                    minValue={filters.terrainAreaMin}
                    maxValue={filters.terrainAreaMax}
                    onMinChange={(v) => onFiltersChange({ terrainAreaMin: v })}
                    onMaxChange={(v) => onFiltersChange({ terrainAreaMax: v })}
                  />
                )}

                {/* HOUSE-specific: Bungalow */}
                {filters.estate === 'HOUSE' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={filters.isBungalow === true}
                      onCheckedChange={(checked) =>
                        onFiltersChange({ isBungalow: checked === true ? true : undefined })
                      }
                    />
                    <span className="text-xs">{t('bungalow')}</span>
                  </label>
                )}

                {/* Extras */}
                <ToggleButtonGroup
                  label={t('extras')}
                  options={extrasOptions}
                  selected={filters.extras || []}
                  onChange={handleExtrasChange}
                />

                {/* Description Search */}
                <div className="space-y-2">
                  <Label className="text-xs">{t('descriptionSearch')}</Label>
                  <Input
                    type="text"
                    placeholder={t('descriptionPlaceholder')}
                    value={filters.description || ''}
                    onChange={(e) => onFiltersChange({ description: e.target.value || undefined })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
