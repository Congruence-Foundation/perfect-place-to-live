'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RangeInput, ToggleButtonGroup, FilterSelect, EstateTypeToggle } from './filters';
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
} from '@/extensions/real-estate/types';
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
} from '@/extensions/real-estate/config';

interface RealEstateSidebarProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: Partial<PropertyFilters>) => void;
  propertyCount?: number;
  isLoading?: boolean;
  isBelowMinZoom?: boolean;
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
  isBelowMinZoom,
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

  // Determine if we're showing type-specific filters
  const isSingleType = filters.estate?.length === 1;
  const isFlat = isSingleType && filters.estate?.[0] === 'FLAT';
  const isHouse = isSingleType && filters.estate?.[0] === 'HOUSE';

  const getStatusText = () => {
    if (isBelowMinZoom) return t('zoomInToSee');
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
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-3 w-full"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-primary text-primary-foreground">
            <Search className="h-4 w-4" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium block">{t('searchCriteria')}</span>
            <span className="text-xs text-muted-foreground">{getStatusText()}</span>
          </div>
        </div>
        <div className="p-1 hover:bg-background/50 rounded transition-colors">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-background/50 pt-3 space-y-4">
            {/* Estate Type Toggle - Multi-select */}
            <EstateTypeToggle
              label={t('estateType')}
              selected={filters.estate || ['FLAT']}
              onChange={(selected) => {
                // Reset type-specific filters when selecting both types
                const resetFilters = selected.length > 1 ? {
                  floors: undefined,
                  flatBuildingType: undefined,
                  floorsNumberMin: undefined,
                  floorsNumberMax: undefined,
                  terrainAreaMin: undefined,
                  terrainAreaMax: undefined,
                  houseBuildingType: undefined,
                  isBungalow: undefined,
                } : {};
                onFiltersChange({ estate: selected, ...resetFilters });
              }}
              flatLabel={t('flat')}
              houseLabel={t('house')}
              requireOne
            />

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

                {/* Building Type - only show when single type selected */}
                {isSingleType && (
                  <ToggleButtonGroup
                    label={t('buildingType')}
                    options={isFlat ? flatBuildingOptions : houseBuildingOptions}
                    selected={
                      isFlat
                        ? filters.flatBuildingType || []
                        : filters.houseBuildingType || []
                    }
                    onChange={(values) => {
                      if (isFlat) {
                        handleFlatBuildingTypeChange(values as FlatBuildingType[]);
                      } else {
                        handleHouseBuildingTypeChange(values as HouseBuildingType[]);
                      }
                    }}
                  />
                )}

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
                {isFlat && (
                  <ToggleButtonGroup
                    label={t('floorLevel')}
                    options={floorOptions}
                    selected={filters.floors || []}
                    onChange={handleFloorsChange}
                  />
                )}

                {/* FLAT-specific: Number of floors in building */}
                {isFlat && (
                  <RangeInput
                    label={t('floorsInBuilding')}
                    minValue={filters.floorsNumberMin}
                    maxValue={filters.floorsNumberMax}
                    onMinChange={(v) => onFiltersChange({ floorsNumberMin: v })}
                    onMaxChange={(v) => onFiltersChange({ floorsNumberMax: v })}
                  />
                )}

                {/* HOUSE-specific: Terrain/Plot Area */}
                {isHouse && (
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
                {isHouse && (
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
