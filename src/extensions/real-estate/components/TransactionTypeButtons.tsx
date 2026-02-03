'use client';

import { useTranslations } from 'next-intl';
import type { PropertyFilters } from '../types';

/** Default price ranges for transaction types */
const DEFAULT_RENT_PRICE = { min: 1000, max: 10000 };
const DEFAULT_SELL_PRICE = { min: 100000, max: 2000000 };

interface TransactionTypeButtonsProps {
  enabled: boolean;
  transaction: PropertyFilters['transaction'];
  onDisable: () => void;
  onSelectRent: () => void;
  onSelectSell: () => void;
}

/**
 * Transaction Type Buttons Component
 * 
 * Shared component for selecting transaction type (None/Rent/Sell).
 * Used in both RealEstateSidebarPanel and RealEstateBottomSheetContent.
 */
export function TransactionTypeButtons({
  enabled,
  transaction,
  onDisable,
  onSelectRent,
  onSelectSell,
}: TransactionTypeButtonsProps) {
  const tRealEstate = useTranslations('realEstate');

  return (
    <div className="flex gap-1 mb-3">
      <button
        onClick={onDisable}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          !enabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
        }`}
      >
        {tRealEstate('none')}
      </button>
      <button
        onClick={onSelectRent}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          enabled && transaction === 'RENT'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
        }`}
      >
        {tRealEstate('rent')}
      </button>
      <button
        onClick={onSelectSell}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          enabled && transaction === 'SELL'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted hover:bg-muted/80 text-muted-foreground'
        }`}
      >
        {tRealEstate('sell')}
      </button>
    </div>
  );
}

/** Export default price ranges for use by consumers */
export { DEFAULT_RENT_PRICE, DEFAULT_SELL_PRICE };
