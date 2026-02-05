'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import { Label } from '@/components/ui/label';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import type { PriceValueFilter as PriceValueFilterType } from '../../types/property';
import { PRICE_CATEGORY_COLORS } from '../../config/price-colors';
import { cn } from '@/lib/utils';
import { DEFAULT_FALLBACK_COLOR } from '@/constants/colors';

// Slider configuration
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_STEP = 20;

// Thumb styling
const THUMB_CLASSES = 'block h-3.5 w-3.5 rounded-full border-2 border-white bg-white shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing';
const THUMB_STYLE = { boxShadow: '0 1px 3px rgba(0,0,0,0.3)' };

// Track gradient using category colors
const TRACK_GRADIENT = `linear-gradient(to right, ${PRICE_CATEGORY_COLORS.no_data} 0%, ${PRICE_CATEGORY_COLORS.great_deal} 20%, ${PRICE_CATEGORY_COLORS.good_deal} 40%, ${PRICE_CATEGORY_COLORS.fair} 60%, ${PRICE_CATEGORY_COLORS.above_avg} 80%, ${PRICE_CATEGORY_COLORS.overpriced} 100%)`;

interface PriceValueFilterOption {
  value: PriceValueFilterType;
  label: string;
  color: string;
  position: number;
}

// Options ordered by position (0, 20, 40, 60, 80, 100)
const PRICE_VALUE_OPTIONS: PriceValueFilterOption[] = [
  { value: 'all', label: 'All', color: PRICE_CATEGORY_COLORS.no_data, position: 0 },
  { value: 'great_deal', label: 'Great', color: PRICE_CATEGORY_COLORS.great_deal, position: 20 },
  { value: 'good_deal', label: 'Good', color: PRICE_CATEGORY_COLORS.good_deal, position: 40 },
  { value: 'fair', label: 'Fair', color: PRICE_CATEGORY_COLORS.fair, position: 60 },
  { value: 'above_avg', label: 'Above', color: PRICE_CATEGORY_COLORS.above_avg, position: 80 },
  { value: 'overpriced', label: 'Over', color: PRICE_CATEGORY_COLORS.overpriced, position: 100 },
];

/** Map of position to option for O(1) lookup */
const OPTION_BY_POSITION = new Map(PRICE_VALUE_OPTIONS.map(o => [o.position, o]));

function isFullRange(range: [number, number]): boolean {
  return range[0] === SLIDER_MIN && range[1] === SLIDER_MAX;
}

function isSingleStep(range: [number, number]): boolean {
  return range[1] - range[0] === SLIDER_STEP;
}

function getRangeLabel(range: [number, number]): string {
  if (isFullRange(range)) return 'All';
  
  const endOption = OPTION_BY_POSITION.get(range[1]);
  if (isSingleStep(range)) {
    return endOption?.label ?? 'Custom';
  }
  
  const startOption = OPTION_BY_POSITION.get(range[0]);
  const startLabel = startOption?.label ?? `${range[0]}%`;
  const endLabel = endOption?.label ?? `${range[1]}%`;
  return `${startLabel} - ${endLabel}`;
}

function getRangeColor(range: [number, number]): string {
  if (isFullRange(range)) return DEFAULT_FALLBACK_COLOR;
  
  if (isSingleStep(range)) {
    return OPTION_BY_POSITION.get(range[1])?.color ?? DEFAULT_FALLBACK_COLOR;
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

export function PriceValueFilter({
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
            <div 
              className="absolute inset-0 rounded-full"
              style={{ background: TRACK_GRADIENT }}
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
            className={THUMB_CLASSES}
            style={THUMB_STYLE}
            aria-label="Minimum price value"
          />
          
          {/* Right thumb */}
          <SliderPrimitive.Thumb 
            className={THUMB_CLASSES}
            style={THUMB_STYLE}
            aria-label="Maximum price value"
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
                aria-label={`Select ${option.label} price range`}
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
