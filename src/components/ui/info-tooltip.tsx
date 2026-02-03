import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoTooltipProps {
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  iconSize?: 'sm' | 'md';
  /** Additional class for the tooltip content (e.g., z-index) */
  contentClassName?: string;
  /** Additional style for the tooltip content (e.g., z-index) */
  contentStyle?: React.CSSProperties;
  /** Click handler for the button (e.g., stopPropagation) */
  onClick?: (e: React.MouseEvent) => void;
}

const ICON_SIZE_CLASSES = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

/**
 * Reusable info tooltip component with consistent styling
 * Displays an info icon that shows a tooltip on hover
 */
export function InfoTooltip({ 
  children, 
  side = 'left', 
  className = 'max-w-xs',
  iconSize = 'sm',
  contentClassName,
  contentStyle,
  onClick
}: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
          type="button" 
          className="p-0.5 hover:bg-muted rounded transition-colors"
          onClick={onClick}
          aria-label="More information"
        >
          <Info className={cn(ICON_SIZE_CLASSES[iconSize], 'text-muted-foreground')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className={cn(className, contentClassName)} style={contentStyle}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
