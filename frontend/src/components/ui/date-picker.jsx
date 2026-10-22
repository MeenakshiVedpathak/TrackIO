import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
const getFirstDayOfWeek = (year, month) => new Date(year, month - 1, 1).getDay();

// "27 Aug 2026" — parsed off the ISO string directly rather than via `new Date(...)`, which would
// reinterpret a bare YYYY-MM-DD as UTC midnight and can shift the day by one west of Greenwich.
// Zero-padded day (DD MMM YYYY) to match the app's canonical formatDate in utils/formatters.js.
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
};

// The "jump to a year" view (see DatePicker's `view` state) — a 12-year grid with prev/next-range
// arrows, same interaction shape as the month grid it temporarily replaces so it doesn't feel like
// a bolted-on second component. Kept year math and rendering local to this component; DatePicker
// only ever passes it the numbers it needs and gets a chosen year back via onPickYear.
const YearGrid = ({ rangeStart, currentYear, minYear, maxYear, onPrevRange, onNextRange, onPickYear }) => {
  const years = Array.from({ length: YEAR_GRID_SIZE }, (_, i) => rangeStart + i);
  const isYearDisabled = (year) => (minYear != null && year < minYear) || (maxYear != null && year > maxYear);

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={onPrevRange} className="rounded p-1 transition-colors hover:bg-accent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="select-none text-sm font-semibold">
          {rangeStart} – {rangeStart + YEAR_GRID_SIZE - 1}
        </span>
        <button type="button" onClick={onNextRange} className="rounded p-1 transition-colors hover:bg-accent">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {years.map((year) => {
          const selected = year === currentYear;
          const yearDisabled = isYearDisabled(year);
          return (
            <button
              key={year}
              type="button"
              disabled={yearDisabled}
              onClick={() => onPickYear(year)}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs transition-colors',
                selected && 'bg-primary font-semibold text-primary-foreground',
                !selected && !yearDisabled && 'hover:bg-accent',
                yearDisabled && 'cursor-not-allowed text-muted-foreground/40'
              )}
            >
              {year}
            </button>
          );
        })}
      </div>
    </>
  );
};

// Single-date sibling of DateRangePicker, sharing its hand-rolled calendar (no date library) and
// popover chrome. Exists because a native <input type="date"> renders in the browser's own locale
// format, which can't be styled to match the rest of the form.
//
// `clearable` is opt-in (unlike MonthYearPicker's, which defaults on): it emits '' — the empty
// value every optional date field here already stores, and what the zod schemas accept via
// `.optional().or(z.literal(''))` — so only fields that may legitimately be blank offer the X.
// Callers that guard `onChange` with `if (date)` must leave it off, or the X would silently no-op.
//
// `ariaLabel` names the trigger for fields with no visible <Label> (e.g. a bare From/To filter
// pair): the button's own text turns into the chosen date, so the placeholder can't carry that.
// Size of the year grid's jump-window — 12 fits a clean 4x3/3x4 grid and matches a calendar
// year's own month count, so the "years" view reads as a natural companion to the "days" one.
const YEAR_GRID_SIZE = 12;

export function DatePicker({
  value,
  onChange,
  max,
  min,
  disabled,
  placeholder = 'Select date',
  className,
  clearable = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [navDate, setNavDate] = useState(() => {
    if (value) {
      const [year, month] = value.split('-').map(Number);
      if (year && month) return { year, month };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  // 'days' (the usual month grid) or 'years' (a jump-to-year grid, entered by clicking the
  // "Month Year" header) — lets any year be reached in one tap instead of clicking the single
  // month arrow up to dozens of times, e.g. picking a birth year or an old employment start date.
  const [view, setView] = useState('days');
  // Which 12-year window the "years" view is showing — recomputed fresh each time that view is
  // entered (see the header button below), not kept in sync continuously, since it only matters
  // while that view is actually open.
  const [yearRangeStart, setYearRangeStart] = useState(() => Math.floor(navDate.year / YEAR_GRID_SIZE) * YEAR_GRID_SIZE);

  const prevMonth = () =>
    setNavDate((d) => (d.month === 1 ? { year: d.year - 1, month: 12 } : { ...d, month: d.month - 1 }));
  const nextMonth = () =>
    setNavDate((d) => (d.month === 12 ? { year: d.year + 1, month: 1 } : { ...d, month: d.month + 1 }));

  const daysInMonth = getDaysInMonth(navDate.year, navDate.month);
  const firstDay = getFirstDayOfWeek(navDate.year, navDate.month);
  const days = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${navDate.year}-${String(navDate.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];

  // ISO YYYY-MM-DD sorts lexicographically the same way it sorts chronologically, so the bounds
  // compare as plain strings.
  const isDisabledDay = (dateStr) => (max && dateStr > max) || (min && dateStr < min);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        // Reopening always lands on the selected date's month, not wherever the user last browsed
        // — and always on the day grid, not left mid-year-jump from the previous time it was open.
        if (o) {
          setView('days');
          if (value) {
            const [year, month] = value.split('-').map(Number);
            if (year && month) setNavDate({ year, month });
          }
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            // Fluid clamp() sizing (see ui/button.jsx's own comment) instead of a fixed h-9/text-sm.
            'flex h-[clamp(1.875rem,2vw,2.25rem)] w-full items-center gap-2 rounded-md border border-input bg-background px-[clamp(0.5rem,0.7vw,0.75rem)] text-left text-[clamp(0.75rem,0.85vw,0.875rem)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="h-[1em] w-[1em] shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{value ? formatDate(value) : placeholder}</span>
          {/* An <svg> child, not a nested <button> (which would be invalid inside the trigger) —
              stopping propagation here keeps the click from also toggling the popover open. This
              is the mouse shortcut only; the popover's "Clear selection" is the keyboard path. */}
          {clearable && value && !disabled && (
            <X
              className="h-[0.9em] w-[0.9em] shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
            />
          )}
        </button>
      </PopoverTrigger>

      {/* Fixed width (not w-auto): the year grid's 3 columns are naturally narrower than the day
          grid's 7, so letting the popover size itself to whichever view is showing made it visibly
          resize/jump every time the header was clicked to switch views. A fixed width, wide enough
          for the 7-column day grid (7 × 2rem cells = 14rem, + padding), keeps both views the same
          size — the year grid's cells just stretch to fill the same box instead. */}
      <PopoverContent className="w-64 p-3" align="start">
        {view === 'days' ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={prevMonth} className="rounded p-1 transition-colors hover:bg-accent">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* Click to jump into the year grid below — the one addition this whole component
                  is for: reaching a far-off year (a birth year, an old employment start date)
                  used to mean clicking the single month arrow above dozens of times. */}
              <button
                type="button"
                onClick={() => {
                  setYearRangeStart(Math.floor(navDate.year / YEAR_GRID_SIZE) * YEAR_GRID_SIZE);
                  setView('years');
                }}
                className="select-none rounded px-2 py-0.5 text-sm font-semibold transition-colors hover:bg-accent"
              >
                {MONTH_NAMES[navDate.month - 1]} {navDate.year}
              </button>
              <button type="button" onClick={nextMonth} className="rounded p-1 transition-colors hover:bg-accent">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7">
              {DAY_NAMES.map((d) => (
                <div key={d} className="py-1 text-center text-[10px] font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {/* justify-items-center: grid-cols-7 splits the row into 7 equal-fraction columns —
                with the popover now a fixed w-64 (wider than the 7 × 2rem day buttons need),
                each column has slack the buttons don't fill, so without centering they'd sit
                flush to their column's start instead of lining up under the weekday headers. */}
            <div className="grid grid-cols-7 justify-items-center">
              {days.map((dateStr, i) => {
                if (!dateStr) return <div key={`e-${i}`} className="h-8 w-8" />;
                const selected = dateStr === value;
                const dayDisabled = isDisabledDay(dateStr);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={dayDisabled}
                    onClick={() => {
                      onChange(dateStr);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors',
                      selected && 'bg-primary font-semibold text-primary-foreground',
                      !selected && !dayDisabled && 'hover:bg-accent',
                      dayDisabled && 'cursor-not-allowed text-muted-foreground/40'
                    )}
                  >
                    {parseInt(dateStr.split('-')[2], 10)}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <YearGrid
            rangeStart={yearRangeStart}
            currentYear={navDate.year}
            minYear={min ? parseInt(min.split('-')[0], 10) : null}
            maxYear={max ? parseInt(max.split('-')[0], 10) : null}
            onPrevRange={() => setYearRangeStart((y) => y - YEAR_GRID_SIZE)}
            onNextRange={() => setYearRangeStart((y) => y + YEAR_GRID_SIZE)}
            onPickYear={(year) => {
              setNavDate((d) => ({ ...d, year }));
              setView('days');
            }}
          />
        )}

        {view === 'days' && clearable && value && (
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="mt-3 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear selection
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default DatePicker;
