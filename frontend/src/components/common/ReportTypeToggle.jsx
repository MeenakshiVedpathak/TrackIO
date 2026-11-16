import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

// Single-row segmented switch (e.g. Daily / Weekly / Monthly / Range), the same height as the
// pickers beside it. In a FilterPanel cell it spans two grid columns from sm up so four labels
// never get squeezed into one narrow filter column (one column is enough from 2xl). `inline` drops
// the label and the grid sizing so the same switch can sit in a page header's action row.
const ReportTypeToggle = ({ options, value, onChange, label = 'Report Type', inline = false, className }) => {
  const segments = (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid h-[clamp(1.875rem,2vw,2.25rem)] gap-0.5 rounded-md border bg-muted p-0.5',
        inline && 'inline-grid'
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex min-w-0 items-center justify-center truncate rounded text-[clamp(0.75rem,0.85vw,0.875rem)] font-medium transition-colors duration-150',
            inline ? 'px-3' : 'px-2',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  if (inline) return <div className={className}>{segments}</div>;

  return (
    <div className={cn('flex flex-col gap-1.5 sm:col-span-2 2xl:col-span-1', className)}>
      <Label className="text-xs">{label}</Label>
      {segments}
    </div>
  );
};

export default ReportTypeToggle;
