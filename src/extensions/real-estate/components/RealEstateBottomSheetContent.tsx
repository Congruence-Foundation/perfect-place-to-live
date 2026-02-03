'use client';

import { useTranslations } from 'next-intl';
import { RealEstateSidebar } from '@/components/Controls';
import PriceValueFilter from './filters/PriceValueFilter';
import { TransactionTypeButtons, DEFAULT_RENT_PRICE, DEFAULT_SELL_PRICE } from './TransactionTypeButtons';
import { ScoreRangeSection } from './ScoreRangeSection';
import { useRealEstateExtension } from '../hooks';

/**
 * Real Estate Bottom Sheet Content Component
 * 
 * This component renders the real estate controls in the mobile bottom sheet.
 * It is self-contained and uses the useRealEstateExtension hook to access state and actions.
 */
export function RealEstateBottomSheetContent() {
  const tRealEstate = useTranslations('realEstate');
  const realEstate = useRealEstateExtension();

  return (
    <>
      {/* Transaction Type Buttons */}
      <TransactionTypeButtons
        enabled={realEstate.enabled}
        transaction={realEstate.filters.transaction}
        onDisable={() => realEstate.setEnabled(false)}
        onSelectRent={() => {
          realEstate.setEnabled(true);
          realEstate.setFilters({ 
            transaction: 'RENT',
            priceMin: DEFAULT_RENT_PRICE.min,
            priceMax: DEFAULT_RENT_PRICE.max
          });
        }}
        onSelectSell={() => {
          realEstate.setEnabled(true);
          realEstate.setFilters({ 
            transaction: 'SELL',
            priceMin: DEFAULT_SELL_PRICE.min,
            priceMax: DEFAULT_SELL_PRICE.max
          });
        }}
      />

      {/* Score Range Slider (only when real estate is enabled) */}
      {realEstate.enabled && (
        <ScoreRangeSection
          scoreRange={realEstate.scoreRange}
          onScoreRangeChange={realEstate.setScoreRange}
        />
      )}

      {/* Price Value Filter (only when real estate is enabled) */}
      {realEstate.enabled && (
        <div className="mb-3">
          <PriceValueFilter
            label={tRealEstate('priceValue')}
            tooltip={tRealEstate('priceValueTooltip')}
            range={realEstate.priceValueRange}
            onChange={realEstate.setPriceValueRange}
          />
        </div>
      )}

      {/* Real Estate Filters (only when enabled) */}
      {realEstate.enabled && (
        <RealEstateSidebar
          filters={realEstate.filters}
          onFiltersChange={realEstate.setFilters}
          propertyCount={realEstate.totalCount}
          isLoading={realEstate.isLoading}
          isBelowMinZoom={realEstate.isBelowMinZoom}
          error={realEstate.error}
        />
      )}
    </>
  );
}
