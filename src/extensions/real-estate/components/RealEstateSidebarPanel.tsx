'use client';

import { useTranslations } from 'next-intl';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { RealEstateSidebar, ScoreRangeSlider, DataSourcesPanel } from '@/components/Controls';
import { PriceValueFilter } from '@/components/Controls/filters';
import { useRealEstateExtension } from '../hooks';

/**
 * Real Estate Sidebar Panel Component
 * 
 * This component renders the real estate controls in the desktop sidebar.
 * It is self-contained and uses the useRealEstateExtension hook to access state and actions.
 */
export function RealEstateSidebarPanel() {
  const tRealEstate = useTranslations('realEstate');
  const realEstate = useRealEstateExtension();

  return (
    <>
      {/* Transaction Type Buttons */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => {
            realEstate.setEnabled(false);
          }}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            !realEstate.enabled
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          {tRealEstate('none')}
        </button>
        <button
          onClick={() => {
            realEstate.setEnabled(true);
            realEstate.setFilters({ 
              transaction: 'RENT',
              priceMin: 1000,
              priceMax: 10000
            });
          }}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            realEstate.enabled && realEstate.filters.transaction === 'RENT'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          {tRealEstate('rent')}
        </button>
        <button
          onClick={() => {
            realEstate.setEnabled(true);
            realEstate.setFilters({ 
              transaction: 'SELL',
              priceMin: 100000,
              priceMax: 2000000
            });
          }}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            realEstate.enabled && realEstate.filters.transaction === 'SELL'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
        >
          {tRealEstate('sell')}
        </button>
      </div>

      {/* Score Range Slider (only when real estate is enabled) */}
      {realEstate.enabled && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">{tRealEstate('scoreFilter')}</span>
            <InfoTooltip>
              <p className="text-xs">{tRealEstate('scoreFilterTooltip')}</p>
            </InfoTooltip>
          </div>
          <ScoreRangeSlider
            value={realEstate.scoreRange}
            onChange={realEstate.setScoreRange}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{realEstate.scoreRange[0]}%</span>
            <span className="text-[10px] text-muted-foreground">{realEstate.scoreRange[1]}%</span>
          </div>
        </div>
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
            error={realEstate.error}
          />
          
          {/* Data Sources */}
          <div className="mt-3">
            <DataSourcesPanel
              enabledSources={realEstate.dataSources}
              onSourcesChange={realEstate.setDataSources}
            />
          </div>
        </>
      )}
    </>
  );
}
