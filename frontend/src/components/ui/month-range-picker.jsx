import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// month/year -> a single comparable integer, so "is this month inside the range" and "is the end
// before the start" both reduce to plain number comparisons regardless of year boundaries.
const toIndex = ({ month, year }) => year * 12 + (month - 1);

/**
 * Single compact "month range" filter — one trigger button ("Jul 2026 → Sep 2026") that opens
 * one popover with a 12-month grid, following the exact two-click selection UX DateRangePicker
 * already uses for day-level ranges (first click sets the start, second sets the end, swapping if
 * the second click lands before the first). Built because every report needing a FROM/TO month
 * range (PM-wise/Project-wise Utilization, Month-wise/Resource-wise Bench) previously used two
 * separate MonthYearPicker boxes side by side — functionally fine, but visually inconsistent with
 * this app's own single-control convention for ranges (DateRangePicker, WeekPicker).
 *
 * `value` / `onChange` shape: { from: {month, year} | null, to: {month, year} | null } — chosen
 * to match the "From"/"To" MonthYearPicker pair it replaces, so callers that already track
 * `fromMonthYear`/`toMonthYear` state can wire this in as `{ from: fromMonthYear, to: toMonthYear }`
 * with a single onChange splitting back into those two setters.
 */
export function MonthRangePicker({
  value,
  onChange,
  placeholder = 'Select month range',
  className,
  clearable = false,
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState('from');
  const [hoverMonth, setHoverMonth] = useState(null);
  const [navYear, setNavYear] = useState(() => value?.from?.year ?? value?.to?.year ?? new Date().getFullYear());

  const from = value?.from ?? null;
  const to = value?.to ?? null;

  const handleOpenChange = (isOpen) => {
    setOpen(isOpen);
    if (isOpen) {
      setSelecting(from && to ? 'from' : from ? 'to' : 'from');
      setNavYear(from?.year ?? to?.year ?? new Date().getFullYear());
    } else {
      setHoverMonth(null);
    }
  };

  const handleMonthClick = (month) => {
    const picked = { month, year: navYear };
    if (selecting === 'from') {
      onChange({ from: picked, to: null });
      setSelecting('to');
      setHoverMonth(null);
    } else {
      if (from && toIndex(picked) < toIndex(from)) {
        onChange({ from: picked, to: from });
      } else {
        onChange({ from, to: picked });
      }
      setSelecting('from');
      setHoverMonth(null);
      setOpen(false);
    }
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onChange({ from: null, to: null });
    setSelecting('from');
    setHoverMonth(null);
  };

  const effectiveTo = selecting === 'to' && hoverMonth != null ? { month: hoverMonth, year: navYear } : to;

  const isFrom = (month) => from && from.year === navYear && from.month === month;
  const isTo = (month) => (to && to.year === navYear && to.month === month)
    || (selecting === 'to' && hoverMonth === month);
  const isInRange = (month) => {
    if (!from || !effectiveTo) return false;
    const idx = toIndex({ month, year: navYear });
    const [lo, hi] = toIndex(from) <= toIndex(effectiveTo) ? [toIndex(from), toIndex(effectiveTo)] : [toIndex(effectiveTo), toIndex(from)];
    return idx > lo && idx < hi;
  };

  const triggerLabel = from && to
    ? `${MONTH_ABBR[from.month - 1]} ${from.year} → ${MONTH_ABBR[to.month - 1]} ${to.year}`
    : from
      ? `${MONTH_ABBR[from.month - 1]} ${from.year} → ...`
      : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            // Fluid clamp() sizing (see ui/button.jsx's own comment) instead of a fixed h-9/text-sm.
            'inline-flex h-[clamp(1.875rem,2vw,2.25rem)] items-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-[clamp(0.5rem,0.7vw,0.75rem)] text-left text-[clamp(0.75rem,0.85vw,0.875rem)] focus:outline-none focus:ring-2 focus:ring-ring',
            !triggerLabel && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="h-[1em] w-[1em] shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{triggerLabel || placeholder}</span>
          {clearable && (from || to) && (
            <X className="h-[0.9em] w-[0.9em] shrink-0 text-muted-foreground hover:text-foreground" onClick={handleClear} />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setNavYear((y) => y - 1)} className="rounded p-1 transition-colors hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="select-none text-sm font-semibold">{navYear}</span>
          <button type="button" onClick={() => setNavYear((y) => y + 1)} className="rounded p-1 transition-colors hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 text-center text-[10px] text-muted-foreground">
          {selecting === 'from' ? 'Click to select the start month' : 'Click to select the end month'}
        </p>

        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_ABBR.map((label, i) => {
            const month = i + 1;
            const start = isFrom(month);
            const end = isTo(month);
            const inRange = isInRange(month);
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleMonthClick(month)}
                onMouseEnter={() => selecting === 'to' && setHoverMonth(month)}
                onMouseLeave={() => selecting === 'to' && setHoverMonth(null)}
                className={cn(
                  'relative flex h-9 items-center justify-center rounded-md text-xs transition-colors',
                  (start || end) && 'z-10 bg-primary font-semibold text-primary-foreground',
                  inRange && 'rounded-none bg-primary/15 text-foreground',
                  !start && !end && !inRange && 'hover:bg-accent'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {clearable && (from || to) && (
          <button
            type="button"
            onClick={handleClear}
            className="mt-3 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear selection
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default MonthRangePicker;
