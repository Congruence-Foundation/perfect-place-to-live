import { Info } from 'lucide-react';
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
  /** Click handler for the button (e.g., stopPropagation) */
  onClick?: (e: React.MouseEvent) => void;
}

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
  onClick
}: InfoTooltipProps) {
  const iconClass = iconSize === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const finalContentClass = contentClassName ? `${className} ${contentClassName}` : className;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
          type="button" 
          className="p-0.5 hover:bg-muted rounded transition-colors"
          onClick={onClick}
        >
          <Info className={`${iconClass} text-muted-foreground`} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className={finalContentClass}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
