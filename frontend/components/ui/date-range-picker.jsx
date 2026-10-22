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

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Select date range',
  className,
  clearable = true,
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

  function handleDayClick(dateStr) {
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

  const triggerLabel =
    startDate && endDate
      ? `${formatDate(startDate)} → ${formatDate(endDate)}`
      : startDate
      ? `${formatDate(startDate)} → ...`
      : null;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) { setSelecting('start'); setHoverDate(null); }
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm h-9 text-left whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring',
            !triggerLabel && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{triggerLabel || placeholder}</span>
          {clearable && (startDate || endDate) && (
            <X
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-3" align="start">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded p-1 hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold select-none">
            {MONTH_NAMES[navDate.month - 1]} {navDate.year}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded p-1 hover:bg-accent transition-colors"
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

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {days.map((dateStr, i) => {
            if (!dateStr) return <div key={`e-${i}`} className="h-8 w-8" />;

            const start = isStart(dateStr);
            const end = isEnd(dateStr);
            const inRange = isInRange(dateStr);
            const day = parseInt(dateStr.split('-')[2]);

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleDayClick(dateStr)}
                onMouseEnter={() => selecting === 'end' && setHoverDate(dateStr)}
                onMouseLeave={() => selecting === 'end' && setHoverDate(null)}
                className={cn(
                  'h-8 w-8 text-xs flex items-center justify-center transition-colors relative',
                  (start || end) && 'bg-primary text-primary-foreground font-semibold rounded-full z-10',
                  inRange && 'bg-primary/15 text-foreground rounded-none',
                  !start && !end && !inRange && 'hover:bg-accent rounded-full'
                )}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Clear */}
        {clearable && (startDate || endDate) && (
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
