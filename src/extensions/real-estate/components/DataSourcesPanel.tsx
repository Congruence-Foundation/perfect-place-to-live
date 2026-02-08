'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Database, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { PropertyDataSource } from '../config/filters';
import { DATA_SOURCE_OPTIONS } from '../config/constants';

interface DataSourcesPanelProps {
  enabledSources: PropertyDataSource[];
  onSourcesChange: (sources: PropertyDataSource[]) => void;
}

export function DataSourcesPanel({
  enabledSources,
  onSourcesChange,
}: DataSourcesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations('realEstate');
  const panelRef = useRef<HTMLDivElement>(null);

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

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const willExpand = !prev;
      if (willExpand) {
        // Scroll the panel into view after expansion animation starts
        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      }
      return willExpand;
    });
  }, []);

  return (
    <div ref={panelRef} className="rounded-xl bg-muted/50 transition-colors">
      {/* Header - always visible */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={handleToggleExpanded}
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
              {t('dataSourcesActive', { count: enabledSources.length })}
            </span>
          </div>
        </button>
        <button
          onClick={handleToggleExpanded}
          className="p-1 hover:bg-background/50 rounded transition-colors"
        >
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-background/50 pt-3 space-y-2">
            {DATA_SOURCE_OPTIONS.map((source) => {
              const isEnabled = enabledSources.includes(source.id);
              
              return (
                <label
                  key={source.id}
                  className="flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer hover:bg-background/50"
                >
                  <Checkbox
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleSourceToggle(source.id, checked === true)}
                    disabled={isEnabled && enabledSources.length === 1}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <span className="text-sm flex-1">{source.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
