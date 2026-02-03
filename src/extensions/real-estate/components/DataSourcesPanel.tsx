'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Database, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { PropertyDataSource } from '../config/filters';

interface DataSourcesPanelProps {
  enabledSources: PropertyDataSource[];
  onSourcesChange: (sources: PropertyDataSource[]) => void;
}

const DATA_SOURCES: { id: PropertyDataSource; name: string; available: boolean }[] = [
  { id: 'otodom', name: 'Otodom', available: true },
  { id: 'gratka', name: 'Gratka', available: false },
];

export default function DataSourcesPanel({
  enabledSources,
  onSourcesChange,
}: DataSourcesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations('realEstate');

  const handleSourceToggle = (source: PropertyDataSource, checked: boolean) => {
    if (checked) {
      onSourcesChange([...enabledSources, source]);
    } else {
      // Don't allow disabling all sources
      if (enabledSources.length > 1) {
        onSourcesChange(enabledSources.filter(s => s !== source));
      }
    }
  };

  const enabledCount = enabledSources.length;

  return (
    <div className="rounded-xl bg-muted/50 transition-colors">
      {/* Header - always visible */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-background">
            <Database className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium block">
              {t('dataSources')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('dataSourcesActive', { count: enabledCount })}
            </span>
          </div>
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-background/50 rounded transition-colors"
        >
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-background/50 pt-3 space-y-2">
            {DATA_SOURCES.map((source) => {
              const isEnabled = enabledSources.includes(source.id);
              const isDisabled = !source.available;
              
              return (
                <label
                  key={source.id}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isDisabled 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'cursor-pointer hover:bg-background/50'
                  }`}
                >
                  <Checkbox
                    checked={isEnabled}
                    onCheckedChange={(checked) => !isDisabled && handleSourceToggle(source.id, checked === true)}
                    disabled={isDisabled || (isEnabled && enabledSources.length === 1)}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <span className="text-sm flex-1">{source.name}</span>
                  {!source.available && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {t('comingSoon')}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
