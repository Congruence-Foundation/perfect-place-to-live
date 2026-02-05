'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { RealEstateSidebar } from '@/components/Controls';
import { PriceValueFilter } from './filters/PriceValueFilter';
import { TransactionTypeButtons } from './TransactionTypeButtons';
import { ScoreRangeSection } from './ScoreRangeSection';
import { DataSourcesPanel } from './DataSourcesPanel';
import { useRealEstateExtension } from '../hooks';

/**
 * Shared Real Estate Filters Content
 * 
 * Contains the common filter UI used by both sidebar and bottom sheet.
 * Renders transaction type buttons, score range, price value filter, and property filters.
 */
export function RealEstateFiltersContent() {
  const tRealEstate = useTranslations('realEstate');
  const realEstate = useRealEstateExtension();
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to top of real estate section when transaction is selected
  const handleSelectTransaction = (transaction: 'RENT' | 'SELL') => {
    realEstate.selectTransaction(transaction);
    // Use setTimeout to allow the UI to update before scrolling
    setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div ref={containerRef}>
      {/* Transaction Type Buttons */}
      <TransactionTypeButtons
        enabled={realEstate.enabled}
        transaction={realEstate.filters.transaction}
        onDisable={() => realEstate.setEnabled(false)}
        onSelectRent={() => handleSelectTransaction('RENT')}
        onSelectSell={() => handleSelectTransaction('SELL')}
      />

      {/* Filters shown only when real estate is enabled */}
      {realEstate.enabled && (
        <>
          <ScoreRangeSection
            scoreRange={realEstate.scoreRange}
            onScoreRangeChange={realEstate.setScoreRange}
          />

          <div className="mb-3">
            <PriceValueFilter
              label={tRealEstate('priceValue')}
              tooltip={tRealEstate('priceValueTooltip')}
              range={realEstate.priceValueRange}
              onChange={realEstate.setPriceValueRange}
            />
          </div>

          <RealEstateSidebar
            filters={realEstate.filters}
            onFiltersChange={realEstate.setFilters}
            propertyCount={realEstate.totalCount}
            isLoading={realEstate.isLoading}
            isBelowMinZoom={realEstate.isBelowMinZoom}
            error={realEstate.error}
          />
          
          <div className="mt-3">
            <DataSourcesPanel
              enabledSources={realEstate.dataSources}
              onSourcesChange={realEstate.setDataSources}
            />
          </div>
        </>
      )}
    </div>
  );
}
