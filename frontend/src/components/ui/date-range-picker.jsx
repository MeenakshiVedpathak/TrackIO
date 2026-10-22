import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// "27 Aug 2026" — zero-padded day + year, matching DatePicker's label format so a single date and
// a range endpoint never disagree about how a date is written.
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

// Same "jump to a year" addition as DatePicker's own YearGrid (see date-picker.jsx's comment for
// the full rationale) — duplicated locally rather than imported/shared, matching how this file
// already keeps its own copies of MONTH_NAMES/DAY_NAMES/formatDate/etc. instead of sharing
// DatePicker's. No min/max here since DateRangePicker doesn't take date bounds today.
const YEAR_GRID_SIZE = 12;
const YearGrid = ({ rangeStart, currentYear, onPrevRange, onNextRange, onPickYear }) => {
  const years = Array.from({ length: YEAR_GRID_SIZE }, (_, i) => rangeStart + i);
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
          return (
            <button
              key={year}
              type="button"
              onClick={() => onPickYear(year)}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs transition-colors',
                selected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent'
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

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Select date range',
  className,
  clearable = true,
  maxDate = null,
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState('start');
  const [hoverDate, setHoverDate] = useState(null);
  const [navDate, setNavDate] = useState(() => {
    if (value?.startDate) {
      const [year, month] = value.startDate.split('-').map(Number);
      return { year, month };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  // 'days' or 'years' — see DatePicker's identical state for the full rationale.
  const [view, setView] = useState('days');
  const [yearRangeStart, setYearRangeStart] = useState(() => Math.floor(navDate.year / YEAR_GRID_SIZE) * YEAR_GRID_SIZE);

  const startDate = value?.startDate || null;
  const endDate = value?.endDate || null;

  function prevMonth() {
    setNavDate((d) =>
      d.month === 1 ? { year: d.year - 1, month: 12 } : { ...d, month: d.month - 1 }
    );
  }

  function nextMonth() {
    setNavDate((d) =>
      d.month === 12 ? { year: d.year + 1, month: 1 } : { ...d, month: d.month + 1 }
    );
  }

  const isDisabled = (dateStr) => maxDate && dateStr > maxDate;

  function handleDayClick(dateStr) {
    if (isDisabled(dateStr)) return;
    if (selecting === 'start') {
      onChange({ startDate: dateStr, endDate: null });
      setSelecting('end');
    } else {
      if (startDate && dateStr < startDate) {
        onChange({ startDate: dateStr, endDate: startDate });
      } else {
        onChange({ startDate, endDate: dateStr });
      }
      setSelecting('start');
      setHoverDate(null);
      setOpen(false);
    }
  }

  function handleClear(e) {
    e?.stopPropagation();
    onChange(null);
    setSelecting('start');
    setHoverDate(null);
  }

  const effectiveEnd = selecting === 'end' ? (hoverDate || endDate) : endDate;

  function isStart(d) { return d === startDate; }
  function isEnd(d) { return d === endDate || (selecting === 'end' && d === hoverDate); }
  function isInRange(d) {
    if (!startDate || !effectiveEnd) return false;
    const [s, e] = startDate <= effectiveEnd ? [startDate, effectiveEnd] : [effectiveEnd, startDate];
    return d > s && d < e;
  }

  const daysInMonth = getDaysInMonth(navDate.year, navDate.month);
  const firstDay = getFirstDayOfWeek(navDate.year, navDate.month);
  const days = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${navDate.year}-${String(navDate.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];

  // Compact trigger: omit year when both dates share the same year to save space.
  function fmtShort(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1].slice(0, 3)}`;
  }
  const sameYear = startDate && endDate && startDate.slice(0, 4) === endDate.slice(0, 4);
  const triggerLabel =
    startDate && endDate
      ? sameYear
        ? `${fmtShort(startDate)} → ${fmtShort(endDate)} ${endDate.slice(0, 4)}`
        : `${formatDate(startDate)} → ${formatDate(endDate)}`
      : startDate
      ? `${fmtShort(startDate)} → ...`
      : null;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) { setSelecting('start'); setHoverDate(null); }
        // Always reopens on the day grid, not left mid-year-jump from the previous time it was open.
        if (o) setView('days');
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            // Fluid clamp() sizing (see button.jsx's own comment) instead of a fixed h-9/text-sm.
            'inline-flex items-center gap-2 rounded-md border border-input bg-background px-[clamp(0.5rem,0.7vw,0.75rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] h-[clamp(1.875rem,2vw,2.25rem)] text-left whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring',
            !triggerLabel && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="h-[1em] w-[1em] shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{triggerLabel || placeholder}</span>
          {clearable && (startDate || endDate) && (
            <X
              className="h-[0.9em] w-[0.9em] shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            />
          )}
        </button>
      </PopoverTrigger>

      {/* Fixed w-64 (not w-auto) so this doesn't visibly resize between the day grid and the year
          grid — same fix and same reasoning as DatePicker's identical PopoverContent. */}
      <PopoverContent className="w-52 p-2" align="start">
        {view === 'days' ? (
          <>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded p-1 hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* Click to jump into the year grid — same addition as DatePicker's. */}
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
              <button
                type="button"
                onClick={nextMonth}
                disabled={maxDate && (navDate.year > new Date().getFullYear() || (navDate.year === new Date().getFullYear() && navDate.month >= new Date().getMonth() + 1))}
                className="rounded p-1 hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Hint */}
            <p className="text-[10px] text-center text-muted-foreground mb-2">
              {selecting === 'start' ? 'Click to select PO start date' : 'Click to select PO end date'}
            </p>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid — justify-items-center: grid-cols-7 splits the fixed width into columns
                wider than the 2rem day buttons need, so center them to avoid gaps. */}
            <div className="grid grid-cols-7 justify-items-center">
              {days.map((dateStr, i) => {
                if (!dateStr) return <div key={`e-${i}`} className="h-8 w-8" />;

                const start = isStart(dateStr);
                const end = isEnd(dateStr);
                const inRange = isInRange(dateStr);
                const disabled = isDisabled(dateStr);
                const day = parseInt(dateStr.split('-')[2]);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDayClick(dateStr)}
                    onMouseEnter={() => !disabled && selecting === 'end' && setHoverDate(dateStr)}
                    onMouseLeave={() => selecting === 'end' && setHoverDate(null)}
                    className={cn(
                      'h-8 w-8 text-xs flex items-center justify-center transition-colors relative',
                      disabled && 'opacity-30 cursor-not-allowed',
                      !disabled && (start || end) && 'bg-primary text-primary-foreground font-semibold rounded-full z-10',
                      !disabled && inRange && 'bg-primary/15 text-foreground rounded-none',
                      !disabled && !start && !end && !inRange && 'hover:bg-accent rounded-full'
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <YearGrid
            rangeStart={yearRangeStart}
            currentYear={navDate.year}
            onPrevRange={() => setYearRangeStart((y) => y - YEAR_GRID_SIZE)}
            onNextRange={() => setYearRangeStart((y) => y + YEAR_GRID_SIZE)}
            onPickYear={(year) => {
              setNavDate((d) => ({ ...d, year }));
              setView('days');
            }}
          />
        )}

        {/* Clear */}
        {view === 'days' && clearable && (startDate || endDate) && (
          <div className="mt-3 text-center">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
              onClick={handleClear}
            >
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
