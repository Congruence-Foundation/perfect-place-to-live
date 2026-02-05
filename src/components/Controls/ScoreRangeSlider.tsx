'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';
import { SCORE_GRADIENT } from '@/constants/colors';

interface ScoreRangeSliderProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * A dual-handle range slider with a red-to-green gradient background.
 * Used to filter properties by their heatmap score (location quality).
 * 
 * Left side (0) = Poor location (red)
 * Right side (100) = Excellent location (green)
 */
export function ScoreRangeSlider({
  value,
  onChange,
  className,
  disabled = false,
}: ScoreRangeSliderProps) {
  const handleValueChange = (newValue: number[]) => {
    if (newValue.length === 2) {
      onChange([newValue[0], newValue[1]]);
    }
  };

  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={handleValueChange}
      min={0}
      max={100}
      step={1}
      disabled={disabled}
      className={cn(
        'relative flex w-full touch-none items-center select-none',
        disabled && 'opacity-50',
        className
      )}
    >
      {/* Track with gradient background */}
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full">
        {/* Gradient background - red to yellow to green */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(to right, ${SCORE_GRADIENT.POOR} 0%, ${SCORE_GRADIENT.AVERAGE} 50%, ${SCORE_GRADIENT.EXCELLENT} 100%)`,
          }}
        />
        {/* Semi-transparent overlay for unselected areas */}
        <div 
          className="absolute inset-0 rounded-full bg-background/60"
          style={{
            clipPath: `polygon(0% 0%, ${value[0]}% 0%, ${value[0]}% 100%, 0% 100%)`,
          }}
        />
        <div 
          className="absolute inset-0 rounded-full bg-background/60"
          style={{
            clipPath: `polygon(${value[1]}% 0%, 100% 0%, 100% 100%, ${value[1]}% 100%)`,
          }}
        />
        {/* Range indicator (the selected portion) - invisible but needed for structure */}
        <SliderPrimitive.Range className="absolute h-full" />
      </SliderPrimitive.Track>
      
      {/* Left thumb */}
      <SliderPrimitive.Thumb 
        className="block h-4 w-4 rounded-full border-2 border-white bg-white shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing"
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
      
      {/* Right thumb */}
      <SliderPrimitive.Thumb 
        className="block h-4 w-4 rounded-full border-2 border-white bg-white shadow-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing"
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </SliderPrimitive.Root>
  );
}
