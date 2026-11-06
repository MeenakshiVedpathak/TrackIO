import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

// Hours-basis values shared by every report: 'M' = Adjusted (after the monthly-cap sync — the
// default everywhere), 'O' = Original (as logged, before the cap). Same codes the reports'
// `hoursSource` API param already uses.
export const HOURS_ADJUSTED = 'M';
export const HOURS_ORIGINAL = 'O';

const OPTIONS = [
  { value: HOURS_ADJUSTED, label: 'Adjusted' },
  { value: HOURS_ORIGINAL, label: 'Original' },
];

const HINT = {
  [HOURS_ADJUSTED]: 'Adjusted — hours after the monthly-cap sync.',
  [HOURS_ORIGINAL]: 'Original — hours exactly as logged, before the monthly cap.',
};

// The one "Hours basis: Adjusted | Original" switch every report places inside its Filters panel,
// so all reports read and behave the same. Counts as an active filter when set to Original (the
// default is Adjusted) — callers add `hoursSource !== HOURS_ADJUSTED` to their activeFilterCount
// and reset it to HOURS_ADJUSTED in Clear Filters.
const HoursBasisToggle = ({ value, onChange, label = 'Hours basis', labelClassName = 'text-xs font-medium', className }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <div className="flex items-center gap-1">
      <Label className={labelClassName}>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground" aria-label="About hours basis" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">{HINT[value] ?? HINT[HOURS_ADJUSTED]}</TooltipContent>
      </Tooltip>
    </div>
    <div role="radiogroup" aria-label={label} className="flex w-full items-center gap-0.5 rounded-lg border bg-muted p-0.5 sm:w-fit">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => value !== opt.value && onChange(opt.value)}
          className={cn(
            'flex h-[clamp(1.625rem,1.8vw,2rem)] flex-1 items-center justify-center whitespace-nowrap rounded-md px-[clamp(0.625rem,0.9vw,0.875rem)] text-[clamp(0.6875rem,0.75vw,0.75rem)] font-semibold transition-all duration-150 sm:flex-none',
            value === opt.value
              ? 'bg-card text-emerald-600 shadow-sm dark:text-emerald-400'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

export default HoursBasisToggle;
