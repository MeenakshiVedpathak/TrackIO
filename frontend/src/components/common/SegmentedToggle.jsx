import { cn } from '@/utils/cn';

// Shared 2-3 way pill toggle (e.g. Status: Active/Inactive/All, Mode: Date/Month) — previously
// hand-rolled near-identically on several master/report pages (EmployeeList, ClientList,
// EmployeeWorkLogComplianceReport). `options` is `[{ value, label }]`; height matches the
// standard h-9 toolbar/input row (grows via min-h-9 if a label wraps) so it drops straight into a
// FilterPanel grid cell.
//
// Every option gets an equal 1/3 (or 1/2) share via `flex-1 basis-0` regardless of label length —
// `min-w-0` is what makes that share actually enforceable: without it, a long one-word label like
// "Overallocated" (TeamCapacityTable's status filter) has an intrinsic min-width equal to its own
// unbroken text width, which the button refused to shrink below, so it kept its full width and
// visually spilled over the next segment ("Bench") instead of respecting the equal split.
// `break-words` then lets that same long label wrap onto a second line within its now-enforced
// narrow share, rather than overflowing or needing truncation.
// Fluid clamp() sizing (see ui/button.jsx's own comment) instead of a fixed min-h-9/text-sm, so
// this matches the height of every other filter field (Select/SearchableSelect/Input) it sits
// beside instead of standing out at its old fixed size once those started shrinking with the
// viewport.
const SegmentedToggle = ({ options, value, onChange, className }) => (
  <div className={cn('flex min-h-[clamp(1.875rem,2vw,2.25rem)] items-stretch overflow-hidden rounded-md border bg-background text-[clamp(0.75rem,0.85vw,0.875rem)]', className)}>
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={cn(
          'min-w-0 flex-1 basis-0 border-r px-2 py-[clamp(0.25rem,0.4vw,0.375rem)] text-center font-medium capitalize leading-tight break-words transition-colors last:border-r-0',
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
