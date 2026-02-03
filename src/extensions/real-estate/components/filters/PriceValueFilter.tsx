'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import { Label } from '@/components/ui/label';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import type { PriceValueFilter as PriceValueFilterType } from '../../types/property';
import { PRICE_CATEGORY_COLORS } from '../../lib';
import { cn } from '@/lib/utils';

// Slider configuration constants
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_STEP = 20;
const DEFAULT_COLOR = '#6b7280';

interface PriceValueFilterOption {
  value: PriceValueFilterType;
  label: string;
  color: string;
  position: number; // 0-100 position on slider
}

const PRICE_VALUE_OPTIONS: PriceValueFilterOption[] = [
  { value: 'all', label: 'All', color: PRICE_CATEGORY_COLORS.no_data, position: 0 },
  { value: 'great_deal', label: 'Great', color: PRICE_CATEGORY_COLORS.great_deal, position: 20 },
  { value: 'good_deal', label: 'Good', color: PRICE_CATEGORY_COLORS.good_deal, position: 40 },
  { value: 'fair', label: 'Fair', color: PRICE_CATEGORY_COLORS.fair, position: 60 },
  { value: 'above_avg', label: 'Above', color: PRICE_CATEGORY_COLORS.above_avg, position: 80 },
  { value: 'overpriced', label: 'Over', color: PRICE_CATEGORY_COLORS.overpriced, position: 100 },
];

/** Check if range covers all options */
function isFullRange(range: [number, number]): boolean {
  return range[0] === SLIDER_MIN && range[1] === SLIDER_MAX;
}

/** Check if range is a single step selection */
function isSingleStep(range: [number, number]): boolean {
  return range[1] - range[0] === SLIDER_STEP;
}

/** Get label for current range */
function getRangeLabel(range: [number, number]): string {
  if (isFullRange(range)) return 'All';
  
  const startOption = PRICE_VALUE_OPTIONS.find(o => o.position === range[0]);
  const endOption = PRICE_VALUE_OPTIONS.find(o => o.position === range[1]);
  
  // Single step selection
  if (isSingleStep(range)) {
    return endOption?.label || 'Custom';
  }
  
  // Range selection
  const startLabel = startOption?.label || `${range[0]}%`;
  const endLabel = endOption?.label || `${range[1]}%`;
  return `${startLabel} - ${endLabel}`;
}

/** Get color for current range */
function getRangeColor(range: [number, number]): string {
  if (isFullRange(range)) return DEFAULT_COLOR;
  
  // For single step, use the end option's color
  if (isSingleStep(range)) {
    const endOption = PRICE_VALUE_OPTIONS.find(o => o.position === range[1]);
    return endOption?.color || DEFAULT_COLOR;
  }
  
  // For range, use the midpoint color
  const midpoint = (range[0] + range[1]) / 2;
  const closest = PRICE_VALUE_OPTIONS.reduce((prev, curr) => 
    Math.abs(curr.position - midpoint) < Math.abs(prev.position - midpoint) ? curr : prev
  );
  return closest.color;
}

interface PriceValueFilterProps {
  label: string;
  tooltip?: string;
  range: [number, number]; // [min, max] as positions 0-100
  onChange: (range: [number, number]) => void;
  disabled?: boolean;
}

export default function PriceValueFilter({
  label,
  tooltip,
  range,
  onChange,
  disabled = false,
}: PriceValueFilterProps) {
  const rangeLabel = getRangeLabel(range);
  const rangeColor = getRangeColor(range);

  const handleValueChange = (newValue: number[]) => {
    if (newValue.length === 2) {
      onChange([newValue[0], newValue[1]]);
    }
  };

  // Handle preset click - select single step interval
  const handlePresetClick = (option: PriceValueFilterOption) => {
    if (disabled) return;
    
    if (option.value === 'all') {
      onChange([SLIDER_MIN, SLIDER_MAX]);
    } else {
      // Select the interval ending at this position
      const endPos = option.position;
      const startPos = Math.max(SLIDER_MIN, endPos - SLIDER_STEP);
      onChange([startPos, endPos]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Label className="text-xs">{label}</Label>
          {tooltip && (
            <InfoTooltip>
              <p className="text-xs">{tooltip}</p>
            </InfoTooltip>
          )}
        </div>
        <span 
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ 
            backgroundColor: rangeColor + '20',
            color: rangeColor 
          }}
        >
          {rangeLabel}
        </span>
      </div>
      
      <div className="pt-1 pb-4">
        <SliderPrimitive.Root
          value={range}
          onValueChange={handleValueChange}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          disabled={disabled}
          className={cn(
            'relative flex w-full touch-none items-center select-none',
            disabled && 'opacity-50'
          )}
        >
          {/* Track with gradient background */}
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full">
            {/* Gradient from gray (all) to green (deals) to red (overpriced) */}
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(to right, #6b7280 0%, #16a34a 20%, #22c55e 40%, #3b82f6 60%, #f97316 80%, #ef4444 100%)',
              }}
            />
            {/* Semi-transparent overlay for unselected areas */}
            <div 
              className="absolute inset-0 rounded-full bg-background/70"
              style={{
                clipPath: `polygon(0% 0%, ${range[0]}% 0%, ${range[0]}% 100%, 0% 100%)`,
              }}
            />
            <div 
              className="absolute inset-0 rounded-full bg-background/70"
              style={{
                clipPath: `polygon(${range[1]}% 0%, 100% 0%, 100% 100%, ${range[1]}% 100%)`,
              }}
            />
            <SliderPrimitive.Range className="absolute h-full bg-transparent" />
          </SliderPrimitive.Track>
          
          {/* Left thumb */}
          <SliderPrimitive.Thumb 
            className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-white shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing"
            style={{
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
          
          {/* Right thumb */}
          <SliderPrimitive.Thumb 
            className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-white shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing"
            style={{
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </SliderPrimitive.Root>
        
        {/* Fixed markers below the slider */}
        <div className="relative w-full mt-1">
          {PRICE_VALUE_OPTIONS.map((option) => {
            // Check if this option is within the selected range
            const isInRange = option.position >= range[0] && option.position <= range[1];
            // Check if this is the exact single-step selection
            const isExactSelection = isSingleStep(range) && option.position === range[1];
            
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePresetClick(option)}
                disabled={disabled}
                className={cn(
                  'absolute -translate-x-1/2 text-[9px] transition-colors',
                  isExactSelection ? 'font-semibold' : isInRange ? 'font-medium' : 'text-muted-foreground hover:text-foreground',
                  disabled && 'cursor-not-allowed'
                )}
                style={{ 
                  left: `${option.position}%`,
                  color: isInRange ? option.color : undefined,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
