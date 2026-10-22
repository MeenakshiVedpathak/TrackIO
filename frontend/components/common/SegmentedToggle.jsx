import { cn } from '@/utils/cn';

// Shared 2-3 way pill toggle (e.g. Status: Active/Inactive/All, Mode: Date/Month) — previously
// hand-rolled near-identically on several master/report pages (EmployeeList, ClientList,
// EmployeeWorkLogComplianceReport). `options` is `[{ value, label }]`; height matches the
// standard h-9 toolbar/input row so it drops straight into a FilterPanel grid cell.
const SegmentedToggle = ({ options, value, onChange, className }) => (
  <div className={cn('flex h-9 items-center overflow-hidden rounded-md border bg-background text-sm', className)}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={cn(
          'h-full flex-1 whitespace-nowrap border-r font-medium capitalize transition-colors last:border-r-0',
          value === opt.value
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-muted-foreground hover:bg-muted'
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export default SegmentedToggle;
