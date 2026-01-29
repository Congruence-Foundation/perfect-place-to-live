'use client';

import { getKColor, getKLabel } from '@/lib/calculator';

const LEGEND_ITEMS = [
  { k: 0.1, label: 'Excellent' },
  { k: 0.3, label: 'Good' },
  { k: 0.5, label: 'Average' },
  { k: 0.7, label: 'Below Average' },
  { k: 0.9, label: 'Poor' },
];

export default function Legend() {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">Living Quality</h3>
      <div className="space-y-1">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.k} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: getKColor(item.k) }}
            />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
