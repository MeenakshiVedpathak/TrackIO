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
        // Reopening always lands on the selected date's month, not wherever the user last browsed.
        if (o && value) {
          const [year, month] = value.split('-').map(Number);
          if (year && month) setNavDate({ year, month });
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{value ? formatDate(value) : placeholder}</span>
          {/* An <svg> child, not a nested <button> (which would be invalid inside the trigger) —
              stopping propagation here keeps the click from also toggling the popover open. This
              is the mouse shortcut only; the popover's "Clear selection" is the keyboard path. */}
          {clearable && value && !disabled && (
            <X
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
            />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={prevMonth} className="rounded p-1 transition-colors hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="select-none text-sm font-semibold">
            {MONTH_NAMES[navDate.month - 1]} {navDate.year}
          </span>
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

        <div className="grid grid-cols-7">
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

        {clearable && value && (
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
