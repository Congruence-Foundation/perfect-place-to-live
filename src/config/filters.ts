/**
 * Filter configuration for real estate search
 * Centralized filter options for all data sources
 */

import {
  RoomCount,
  FloorLevel,
  FlatBuildingType,
  HouseBuildingType,
  BuildingMaterial,
  PropertyExtra,
  MarketType,
  OwnerType,
} from '@/types/property';
import { DataSource } from '@/components/Controls/DataSourcesPanel';

// ============================================================================
// Filter Option Types
// ============================================================================

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export interface TranslatableFilterOption<T extends string> {
  value: T;
  labelKey: string;
}

// ============================================================================
// Room Options
// ============================================================================

export const ROOM_OPTIONS: FilterOption<RoomCount>[] = [
  { value: 'ONE', label: '1' },
  { value: 'TWO', label: '2' },
  { value: 'THREE', label: '3' },
  { value: 'FOUR', label: '4' },
  { value: 'FIVE', label: '5' },
  { value: 'SIX', label: '6+' },
];

// ============================================================================
// Floor Options (FLAT-specific)
// ============================================================================

export const FLOOR_OPTIONS: TranslatableFilterOption<FloorLevel>[] = [
  { value: 'CELLAR', labelKey: 'floorCellar' },
  { value: 'GROUND', labelKey: 'floorGround' },
  { value: 'FIRST', labelKey: 'floor1' },
  { value: 'SECOND', labelKey: 'floor2' },
  { value: 'THIRD', labelKey: 'floor3' },
  { value: 'FOURTH', labelKey: 'floor4' },
  { value: 'FIFTH', labelKey: 'floor5' },
  { value: 'SIXTH', labelKey: 'floor6' },
  { value: 'SEVENTH', labelKey: 'floor7' },
  { value: 'EIGHTH', labelKey: 'floor8' },
  { value: 'NINTH', labelKey: 'floor9' },
  { value: 'TENTH', labelKey: 'floor10' },
  { value: 'ABOVE_TENTH', labelKey: 'floorAbove10' },
  { value: 'GARRET', labelKey: 'floorGarret' },
];

// ============================================================================
// Building Type Options
// ============================================================================

export const FLAT_BUILDING_TYPE_OPTIONS: TranslatableFilterOption<FlatBuildingType>[] = [
  { value: 'BLOCK', labelKey: 'buildingBlock' },
  { value: 'TENEMENT', labelKey: 'buildingTenement' },
  { value: 'APARTMENT', labelKey: 'buildingApartment' },
  { value: 'HOUSE', labelKey: 'buildingHouseFlat' },
  { value: 'INFILL', labelKey: 'buildingInfill' },
  { value: 'RIBBON', labelKey: 'buildingRibbon' },
];

export const HOUSE_BUILDING_TYPE_OPTIONS: TranslatableFilterOption<HouseBuildingType>[] = [
  { value: 'DETACHED', labelKey: 'buildingDetached' },
  { value: 'SEMI_DETACHED', labelKey: 'buildingSemiDetached' },
  { value: 'TENEMENT', labelKey: 'buildingTenement' },
  { value: 'RIBBON', labelKey: 'buildingRibbon' },
  { value: 'RESIDENCE', labelKey: 'buildingResidence' },
  { value: 'FARM', labelKey: 'buildingFarm' },
];

// ============================================================================
// Building Material Options
// ============================================================================

export const BUILDING_MATERIAL_OPTIONS: TranslatableFilterOption<BuildingMaterial>[] = [
  { value: 'BRICK', labelKey: 'materialBrick' },
  { value: 'WOOD', labelKey: 'materialWood' },
  { value: 'CONCRETE', labelKey: 'materialConcrete' },
  { value: 'CONCRETE_PLATE', labelKey: 'materialConcretePlate' },
  { value: 'CELLULAR_CONCRETE', labelKey: 'materialCellularConcrete' },
  { value: 'SILIKAT', labelKey: 'materialSilikat' },
  { value: 'BREEZEBLOCK', labelKey: 'materialBreezeblock' },
  { value: 'HYDROTON', labelKey: 'materialHydroton' },
  { value: 'REINFORCED_CONCRETE', labelKey: 'materialReinforcedConcrete' },
  { value: 'OTHER', labelKey: 'materialOther' },
];

// Commonly used materials (first 5)
export const COMMON_BUILDING_MATERIALS = BUILDING_MATERIAL_OPTIONS.slice(0, 5);

// ============================================================================
// Extras Options
// ============================================================================

export const EXTRAS_OPTIONS: TranslatableFilterOption<PropertyExtra>[] = [
  { value: 'BALCONY', labelKey: 'extraBalcony' },
  { value: 'TERRACE', labelKey: 'extraTerrace' },
  { value: 'GARAGE', labelKey: 'extraGarage' },
  { value: 'BASEMENT', labelKey: 'extraBasement' },
  { value: 'LIFT', labelKey: 'extraLift' },
  { value: 'SEPARATE_KITCHEN', labelKey: 'extraSeparateKitchen' },
  { value: 'GARDEN', labelKey: 'extraGarden' },
  { value: 'TWO_STOREY', labelKey: 'extraTwoStorey' },
  { value: 'HAS_PHOTOS', labelKey: 'extraHasPhotos' },
];

// ============================================================================
// Listing Age Options
// ============================================================================

export const LISTING_AGE_OPTIONS: TranslatableFilterOption<string>[] = [
  { value: 'any', labelKey: 'listingAgeAny' },
  { value: '1', labelKey: 'listingAge1' },
  { value: '3', labelKey: 'listingAge3' },
  { value: '7', labelKey: 'listingAge7' },
  { value: '14', labelKey: 'listingAge14' },
  { value: '30', labelKey: 'listingAge30' },
];

// ============================================================================
// Market Type Options
// ============================================================================

export const MARKET_OPTIONS: TranslatableFilterOption<MarketType>[] = [
  { value: 'ALL', labelKey: 'marketAll' },
  { value: 'PRIMARY', labelKey: 'marketPrimary' },
  { value: 'SECONDARY', labelKey: 'marketSecondary' },
];

// ============================================================================
// Owner Type Options
// ============================================================================

export const OWNER_TYPE_OPTIONS: TranslatableFilterOption<OwnerType>[] = [
  { value: 'ALL', labelKey: 'ownerAll' },
  { value: 'PRIVATE', labelKey: 'ownerPrivate' },
  { value: 'DEVELOPER', labelKey: 'ownerDeveloper' },
  { value: 'AGENCY', labelKey: 'ownerAgency' },
];

// ============================================================================
// Data Source Filter Capabilities
// ============================================================================

export type FilterCapability =
  | 'rooms'
  | 'area'
  | 'price'
  | 'pricePerMeter'
  | 'buildYear'
  | 'market'
  | 'ownerType'
  | 'listingAge'
  | 'floors'
  | 'floorsInBuilding'
  | 'flatBuildingType'
  | 'houseBuildingType'
  | 'terrainArea'
  | 'bungalow'
  | 'buildingMaterial'
  | 'extras'
  | 'description';

export interface DataSourceFilterConfig {
  name: string;
  available: boolean;
  supports: FilterCapability[];
}

/**
 * Filter capabilities per data source
 * This allows different data sources to support different filter options
 */
export const DATA_SOURCE_FILTERS: Record<DataSource, DataSourceFilterConfig> = {
  otodom: {
    name: 'Otodom',
    available: true,
    supports: [
      'rooms',
      'area',
      'price',
      'pricePerMeter',
      'buildYear',
      'market',
      'ownerType',
      'listingAge',
      'floors',
      'floorsInBuilding',
      'flatBuildingType',
      'houseBuildingType',
      'terrainArea',
      'bungalow',
      'buildingMaterial',
      'extras',
      'description',
    ],
  },
  gratka: {
    name: 'Gratka',
    available: false,
    supports: [
      'rooms',
      'area',
      'price',
      'buildYear',
      'market',
    ],
  },
};
