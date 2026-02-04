'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Factor } from '@/types';
import { POI_COLORS, FACTOR_ICON_MAP, DEFAULT_FACTOR_ICON, DEFAULT_FALLBACK_COLOR } from '@/constants';
import { WEIGHT_THRESHOLDS } from '@/constants/performance';
import { formatDistance } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Info,
  ChevronDown,
  ChevronUp,
  MapPin,
} from 'lucide-react';

interface WeightSlidersProps {
  factors: Factor[];
  onFactorChange: (factorId: string, updates: Partial<Factor>) => void;
}

// Max distance presets for different factor types (in meters)
const MAX_DISTANCE_LIMITS: Record<string, { min: number; max: number; step: number }> = {
  // Essential services
  grocery: { min: 200, max: 5000, step: 100 },
  transit: { min: 100, max: 3000, step: 100 },
  healthcare: { min: 500, max: 10000, step: 250 },
  schools: { min: 300, max: 5000, step: 100 },
  post: { min: 200, max: 5000, step: 100 },
  banks: { min: 300, max: 5000, step: 100 },
  // Lifestyle
  parks: { min: 200, max: 3000, step: 100 },
  restaurants: { min: 200, max: 3000, step: 100 },
  gyms: { min: 300, max: 5000, step: 100 },
  playgrounds: { min: 100, max: 2000, step: 50 },
  nightlife: { min: 200, max: 3000, step: 100 },
  universities: { min: 500, max: 5000, step: 250 },
  religious: { min: 200, max: 3000, step: 100 },
  dog_parks: { min: 200, max: 3000, step: 100 },
  coworking: { min: 300, max: 5000, step: 100 },
  cinemas: { min: 500, max: 5000, step: 250 },
  markets: { min: 300, max: 5000, step: 100 },
  water: { min: 200, max: 5000, step: 100 },
  // Environment (things to avoid)
  industrial: { min: 100, max: 3000, step: 100 },
  highways: { min: 50, max: 1500, step: 50 },
  stadiums: { min: 500, max: 5000, step: 250 },
  airports: { min: 500, max: 10000, step: 500 },
  railways: { min: 100, max: 2000, step: 100 },
  cemeteries: { min: 100, max: 2000, step: 100 },
  construction: { min: 100, max: 2000, step: 100 },
};

const DEFAULT_LIMITS = { min: 100, max: 5000, step: 100 };

export default function WeightSliders({ factors, onFactorChange }: WeightSlidersProps) {
  const [expandedFactors, setExpandedFactors] = useState<Set<string>>(new Set());
  const tFactors = useTranslations('factors');
  const tCategories = useTranslations('categories');
  const tWeight = useTranslations('weight');
  const tTooltip = useTranslations('factorTooltip');
  const tTags = useTranslations('tags');

  const toggleExpanded = (factorId: string) => {
    setExpandedFactors(prev => {
      const next = new Set(prev);
      if (next.has(factorId)) {
        next.delete(factorId);
      } else {
        next.add(factorId);
      }
      return next;
    });
  };

  // Get weight label based on value
  const getWeightLabel = (weight: number): { text: string; color: string } => {
    const absWeight = Math.abs(weight);
    if (weight === 0) return { text: tWeight('neutral'), color: 'text-muted-foreground' };
    
    if (weight > 0) {
      if (absWeight >= WEIGHT_THRESHOLDS.STRONG) return { text: tWeight('strongPrefer'), color: 'text-green-600' };
      if (absWeight >= WEIGHT_THRESHOLDS.MODERATE) return { text: tWeight('prefer'), color: 'text-green-500' };
      return { text: tWeight('slightPrefer'), color: 'text-green-400' };
    } else {
      if (absWeight >= WEIGHT_THRESHOLDS.STRONG) return { text: tWeight('strongAvoid'), color: 'text-red-600' };
      if (absWeight >= WEIGHT_THRESHOLDS.MODERATE) return { text: tWeight('avoid'), color: 'text-red-500' };
      return { text: tWeight('slightAvoid'), color: 'text-red-400' };
    }
  };

  const formatOsmTags = (tags: string[]): string => {
    return tags
      .map(tag => {
        try {
          return tTags(tag);
        } catch {
          return tag;
        }
      })
      .join(', ');
  };

  const essentialFactors = factors.filter((f) => f.category === 'essential');
  const lifestyleFactors = factors.filter((f) => f.category === 'lifestyle');
  const environmentFactors = factors.filter((f) => f.category === 'environment');

  const renderFactor = (factor: Factor) => {
    const IconComponent = FACTOR_ICON_MAP[factor.icon] || DEFAULT_FACTOR_ICON;
    const color = POI_COLORS[factor.id] || DEFAULT_FALLBACK_COLOR;
    const tagDescription = formatOsmTags(factor.osmTags);
    const isExpanded = expandedFactors.has(factor.id);
    const limits = MAX_DISTANCE_LIMITS[factor.id] || DEFAULT_LIMITS;
    const weightLabel = getWeightLabel(factor.weight);
    const isNegative = factor.weight < 0;
    const factorName = tFactors(factor.id);

    return (
      <div key={factor.id} className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`factor-${factor.id}`}
            checked={factor.enabled}
            onCheckedChange={(checked) =>
              onFactorChange(factor.id, { enabled: checked === true })
            }
          />
          {/* Color indicator dot */}
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <Label
            htmlFor={`factor-${factor.id}`}
            className={`flex items-center gap-2 cursor-pointer ${
              !factor.enabled ? 'text-muted-foreground' : ''
            }`}
          >
            <IconComponent 
              className="h-4 w-4" 
              style={{ color: factor.enabled ? color : undefined }}
            />
            <span>{factorName}</span>
          </Label>
          
          {/* Info tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="p-0.5 hover:bg-muted rounded transition-colors">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium text-sm">{factorName}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">{tTooltip('poiTypes')}:</span> {tagDescription}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">{tTooltip('maxDistance')}:</span> {formatDistance(factor.maxDistance)}
                </p>
                <p className="text-xs">
                  <span className="font-medium">{tTooltip('mode')}:</span>{' '}
                  {isNegative ? (
                    <span className="text-red-500">{tTooltip('avoidMode')}</span>
                  ) : factor.weight > 0 ? (
                    <span className="text-green-500">{tTooltip('preferMode')}</span>
                  ) : (
                    <span className="text-muted-foreground">{tWeight('neutral')}</span>
                  )}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>

          <span className={`ml-auto text-xs font-medium ${weightLabel.color}`}>
            {factor.weight > 0 ? '+' : ''}{factor.weight}
          </span>
        </div>
        
        {/* Bidirectional weight slider */}
        <div className="relative">
          {/* Background gradient indicator */}
          <div className="absolute inset-0 h-2 top-1/2 -translate-y-1/2 rounded-full overflow-hidden pointer-events-none">
            <div className="absolute inset-0 flex">
              <div className="w-1/2 bg-gradient-to-r from-red-200 to-gray-100" />
              <div className="w-1/2 bg-gradient-to-r from-gray-100 to-green-200" />
            </div>
          </div>
          <Slider
            value={[factor.weight]}
            onValueChange={([value]) => onFactorChange(factor.id, { weight: value })}
            min={-100}
            max={100}
            step={5}
            disabled={!factor.enabled}
            className={`relative ${!factor.enabled ? 'opacity-50' : ''}`}
          />
        </div>
        
        {/* Labels under slider */}
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>{tWeight('avoid')}</span>
          <span className={weightLabel.color}>{weightLabel.text}</span>
          <span>{tWeight('prefer')}</span>
        </div>

        {/* Expandable max distance section */}
        <button
          type="button"
          onClick={() => toggleExpanded(factor.id)}
          disabled={!factor.enabled}
          aria-expanded={isExpanded}
          aria-controls={`max-distance-${factor.id}`}
          className={`flex items-center gap-1 text-xs transition-colors w-full ${
            factor.enabled 
              ? 'text-muted-foreground hover:text-foreground' 
              : 'text-muted-foreground/50 cursor-not-allowed'
          }`}
        >
          <MapPin className="h-3 w-3" />
          <span>Max: {formatDistance(factor.maxDistance)}</span>
          {factor.enabled && (
            isExpanded 
              ? <ChevronUp className="h-3 w-3 ml-auto" />
              : <ChevronDown className="h-3 w-3 ml-auto" />
          )}
        </button>

        {/* Max distance slider (expanded) */}
        {isExpanded && factor.enabled && (
          <div id={`max-distance-${factor.id}`} className="pl-4 space-y-1 border-l-2 border-muted">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatDistance(limits.min)}</span>
              <span className="font-medium text-foreground">{formatDistance(factor.maxDistance)}</span>
              <span>{formatDistance(limits.max)}</span>
            </div>
            <Slider
              value={[factor.maxDistance]}
              onValueChange={([value]) => onFactorChange(factor.id, { maxDistance: value })}
              min={limits.min}
              max={limits.max}
              step={limits.step}
            />
            <p className="text-xs text-muted-foreground">
              {isNegative 
                ? tTooltip('distanceToStayAway')
                : tTooltip('maxAcceptableDistance')
              }
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Essential Factors */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm text-foreground">{tCategories('essential')}</h3>
        {essentialFactors.map(renderFactor)}
      </div>

      {/* Lifestyle Factors */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm text-foreground">{tCategories('lifestyle')}</h3>
        {lifestyleFactors.map(renderFactor)}
      </div>

      {/* Environment Factors */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm text-foreground">{tCategories('environment')}</h3>
        {environmentFactors.map(renderFactor)}
      </div>
    </div>
  );
}
