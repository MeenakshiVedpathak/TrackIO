import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';
import { formatHourMinuteValue } from '@/utils/formatters';
import { isOffDay } from '@/utils/weekOffPolicy';
import { EXPECTED_DAILY_HOURS } from './WorkLogEntryModal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const LEGEND = [
  { key: 'completed', dot: 'bg-emerald-500', label: `${EXPECTED_DAILY_HOURS}/${EXPECTED_DAILY_HOURS} hrs`, sub: 'Completed' },
  { key: 'partial', dot: 'bg-amber-500', label: `1-${EXPECTED_DAILY_HOURS - 1} hrs`, sub: 'Partial' },
  { key: 'none', dot: 'bg-rose-500', label: '0 hrs', sub: 'No Entry' },
  { key: 'weekend', dot: 'bg-muted-foreground/30', label: 'Day Off', sub: '' },
  { key: 'today', dot: 'bg-primary', label: 'Today', sub: '' },
];

// A day's color is purely a client-side read of `totalHours` against a standard 8-hour
// workday (EXPECTED_DAILY_HOURS) — the backend has no "target hours" or "completed" concept,
// this is just a visual aid over the same { date, totalHours, hasEntries } the list view uses.
const dayStatus = ({ dayInfo, isWeekend, isFuture }) => {
  const hours = Number(dayInfo?.totalHours ?? 0);
  // Weekend takes priority over "future" so an upcoming off-day (e.g. next month's Sunday, or
  // an alternate-Saturday per the BU's saturday_off_rule) still reads as a weekend instead of
  // blending into ordinary future workdays — only a logged weekend falls through as worked time.
  if (isWeekend && hours === 0) return isFuture ? 'futureWeekend' : 'weekend';
  if (isFuture) return 'future';
  if (hours >= EXPECTED_DAILY_HOURS) return 'completed';
  if (hours > 0) return 'partial';
  return 'none';
};

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  none: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
  weekend: 'bg-muted/40 text-muted-foreground/60',
  futureWeekend: 'bg-muted/20 text-muted-foreground/35',
  future: 'text-muted-foreground/30',
};

const buildMonthGrid = (monthDate) => {
  const startOfGrid = monthDate.startOf('month').startOf('week');
  const endOfGrid = monthDate.endOf('month').endOf('week');
  const days = [];
  let cursor = startOfGrid;
  while (cursor.isBefore(endOfGrid) || cursor.isSame(endOfGrid, 'day')) {
    days.push(cursor);
    cursor = cursor.add(1, 'day');
  }
  return days;
};

// Month grid with per-day logged hours, driven directly by the backend's calendar aggregate
// (GET /employee-timesheets/calendar -> [{ date, totalHours, hasEntries, futureDisabled }]).
// A date is disabled if either the client's own "after today" check or the backend's
// `futureDisabled` flag says so — belt-and-suspenders, since the real enforcement is
// server-side on the entries endpoints regardless.
const TimesheetCalendar = ({ month, year, onMonthChange, calendarByDate, selectedDate, onSelectDate, isLoading, saturdayOffRule = 'ALL' }) => {
  const monthDate = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const today = dayjs().startOf('day');

  const days = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  const goPrev = () => {
    const prev = monthDate.subtract(1, 'month');
    onMonthChange(prev.month() + 1, prev.year());
  };
  const goNext = () => {
    const next = monthDate.add(1, 'month');
    onMonthChange(next.month() + 1, next.year());
  };

  // Mobile only: the full grid+legend is the tallest thing on the page, sitting above the actual
  // work log entry form (this screen stacks to a single column below `lg` — see
  // EmployeeTimesheet.jsx). Starts collapsed on mobile — a date is always already selected
  // (defaults to today), so there's nothing to gain from showing the whole grid before the user
  // has asked to change it. Tapping the summary re-expands it; picking a new day re-collapses it.
  // Desktop never sees this — `isMobile` gates it off entirely there, so the `lg:` two-column
  // layout keeps the calendar permanently visible exactly as before.
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);

  const handleSelectDate = (day) => {
    onSelectDate(day);
    if (isMobile) setCollapsed(true);
  };

  if (isMobile && collapsed) {
    const dateKey = selectedDate.format('YYYY-MM-DD');
    const dayInfo = calendarByDate?.[dateKey];
    const isFuture = selectedDate.isAfter(today, 'day') || !!dayInfo?.futureDisabled;
    const isWeekend = isOffDay(selectedDate, saturdayOffRule);
    const status = dayStatus({ dayInfo, isWeekend, isFuture });
    const dot = LEGEND.find((l) => l.key === (status === 'futureWeekend' ? 'weekend' : status))?.dot ?? LEGEND[2].dot;

    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} />
          <span className="min-w-0 truncate text-sm font-semibold">{selectedDate.format('ddd, DD MMM YYYY')}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {status === 'weekend' || status === 'futureWeekend' ? 'Day Off' : `${formatHourMinuteValue(dayInfo?.totalHours ?? 0)} logged`}
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="icon-sm" onClick={goPrev} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">{monthDate.format('MMMM YYYY')}</h2>
        <Button variant="outline" size="icon-sm" onClick={goNext} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateKey = day.format('YYYY-MM-DD');
          const inMonth = day.month() === monthDate.month();
          const dayInfo = calendarByDate?.[dateKey];
          const isFuture = day.isAfter(today, 'day') || !!dayInfo?.futureDisabled;
          const isToday = day.isSame(today, 'day');
          const isSelected = selectedDate && day.isSame(selectedDate, 'day');
          const isWeekend = isOffDay(day, saturdayOffRule);
          const status = dayStatus({ dayInfo, isWeekend, isFuture });

          const isWeekendStatus = status === 'weekend' || status === 'futureWeekend';

          const dayButton = (
            <button
              key={dateKey}
              type="button"
              disabled={isFuture || !inMonth}
              onClick={() => handleSelectDate(day)}
              className={cn(
                'relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors',
                !inMonth ? 'cursor-default text-muted-foreground/25' : STATUS_STYLES[status],
                inMonth && !isFuture && !isSelected && 'hover:brightness-95 cursor-pointer',
                isFuture && inMonth && 'cursor-not-allowed',
                isSelected && 'bg-primary text-primary-foreground hover:brightness-100'
              )}
            >
              <span className="font-semibold">{day.date()}</span>
              {isLoading ? (
                <Skeleton className="mt-0.5 h-2.5 w-8" />
              ) : inMonth && (status === 'completed' || status === 'partial' || status === 'none') ? (
                <span className={cn('text-[10px] font-medium', isSelected && 'text-primary-foreground/85')}>
                  {formatHourMinuteValue(dayInfo?.totalHours ?? 0)}
                </span>
              ) : inMonth && isWeekendStatus ? (
                <CalendarOff
                  className={cn('h-3.5 w-3.5', isSelected ? 'text-primary-foreground/85' : 'text-muted-foreground/60')}
                />
              ) : null}
              {isToday && (
                <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', isSelected ? 'bg-primary-foreground' : 'bg-primary')} />
              )}
            </button>
          );

          if (inMonth && isWeekendStatus) {
            return (
              <Tooltip key={dateKey}>
                <TooltipTrigger asChild>{dayButton}</TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Week Off
                </TooltipContent>
              </Tooltip>
            );
          }
          return dayButton;
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
        {LEGEND.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', item.dot)} />
            {item.label}
            {item.sub && <span className="text-muted-foreground/70">{item.sub}</span>}
          </span>
        ))}
      </div>
    </div>
  );
};

export default TimesheetCalendar;
