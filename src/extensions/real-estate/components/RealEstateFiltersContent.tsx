'use client';

import { useTranslations } from 'next-intl';
import { RealEstateSidebar } from '@/components/Controls';
import { PriceValueFilter } from './filters/PriceValueFilter';
import { TransactionTypeButtons } from './TransactionTypeButtons';
import { ScoreRangeSection } from './ScoreRangeSection';
import { DataSourcesPanel } from './DataSourcesPanel';
import { useRealEstateExtension } from '../hooks';

interface RealEstateFiltersContentProps {
  /** Additional content to render after the main filters (when enabled) */
  children?: React.ReactNode;
}

/**
 * Shared Real Estate Filters Content
 * 
 * Contains the common filter UI used by both sidebar and bottom sheet.
 * Renders transaction type buttons, score range, price value filter, and property filters.
 */
export function RealEstateFiltersContent({ children }: RealEstateFiltersContentProps) {
  const tRealEstate = useTranslations('realEstate');
  const realEstate = useRealEstateExtension();

  return (
    <>
      {/* Transaction Type Buttons */}
      <TransactionTypeButtons
        enabled={realEstate.enabled}
        transaction={realEstate.filters.transaction}
        onDisable={() => realEstate.setEnabled(false)}
        onSelectRent={() => realEstate.selectTransaction('RENT')}
        onSelectSell={() => realEstate.selectTransaction('SELL')}
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
        <>
          <RealEstateSidebar
            filters={realEstate.filters}
            onFiltersChange={realEstate.setFilters}
            propertyCount={realEstate.totalCount}
            isLoading={realEstate.isLoading}
            isBelowMinZoom={realEstate.isBelowMinZoom}
            error={realEstate.error}
          />
          {/* Data Sources Panel */}
          <div className="mt-3">
            <DataSourcesPanel
              enabledSources={realEstate.dataSources}
              onSourcesChange={realEstate.setDataSources}
            />
          </div>
          {children}
        </>
      )}
    </>
  );
}
