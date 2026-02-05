'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PropertyFilters } from '../types';

const BASE_BUTTON_CLASSES = 'flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors';
const ACTIVE_BUTTON_CLASSES = 'bg-primary text-primary-foreground';
const INACTIVE_BUTTON_CLASSES = 'bg-muted hover:bg-muted/80 text-muted-foreground';

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
 * Used in both RealEstateSidebarPanel and mobile bottom sheet.
 */
export function TransactionTypeButtons({
  enabled,
  transaction,
  onDisable,
  onSelectRent,
  onSelectSell,
}: TransactionTypeButtonsProps) {
  const tRealEstate = useTranslations('realEstate');

  const getButtonClasses = (isActive: boolean) =>
    cn(BASE_BUTTON_CLASSES, isActive ? ACTIVE_BUTTON_CLASSES : INACTIVE_BUTTON_CLASSES);

  return (
    <div className="flex gap-1 mb-3">
      <button onClick={onDisable} className={getButtonClasses(!enabled)}>
        {tRealEstate('none')}
      </button>
      <button onClick={onSelectRent} className={getButtonClasses(enabled && transaction === 'RENT')}>
        {tRealEstate('rent')}
      </button>
      <button onClick={onSelectSell} className={getButtonClasses(enabled && transaction === 'SELL')}>
        {tRealEstate('sell')}
      </button>
    </div>
  );
}
