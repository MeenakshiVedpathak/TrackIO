import { useMemo } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/cn';
import { formatHourMinuteValue } from '@/utils/formatters';
import { EXPECTED_DAILY_HOURS } from './WorkLogEntryModal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const LEGEND = [
  { key: 'completed', dot: 'bg-emerald-500', label: `${EXPECTED_DAILY_HOURS}/${EXPECTED_DAILY_HOURS} hrs`, sub: 'Completed' },
  { key: 'partial', dot: 'bg-amber-500', label: `1-${EXPECTED_DAILY_HOURS - 1} hrs`, sub: 'Partial' },
  { key: 'none', dot: 'bg-rose-500', label: '0 hrs', sub: 'No Entry' },
  { key: 'weekend', dot: 'bg-muted-foreground/30', label: 'Weekend', sub: 'Off' },
  { key: 'today', dot: 'bg-primary', label: 'Today', sub: '' },
];

// A day's color is purely a client-side read of `totalHours` against a standard 8-hour
// workday (EXPECTED_DAILY_HOURS) — the backend has no "target hours" or "completed" concept,
// this is just a visual aid over the same { date, totalHours, hasEntries } the list view uses.
const dayStatus = ({ dayInfo, isWeekend, isFuture }) => {
  if (isFuture) return 'future';
  const hours = Number(dayInfo?.totalHours ?? 0);
  if (isWeekend && hours === 0) return 'weekend';
  if (hours >= EXPECTED_DAILY_HOURS) return 'completed';
  if (hours > 0) return 'partial';
  return 'none';
};

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  none: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
  weekend: 'bg-muted/40 text-muted-foreground/60',
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
const TimesheetCalendar = ({ month, year, onMonthChange, calendarByDate, selectedDate, onSelectDate, isLoading }) => {
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
          const isWeekend = day.day() === 0 || day.day() === 6;
          const status = dayStatus({ dayInfo, isWeekend, isFuture });

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isFuture || !inMonth}
              onClick={() => onSelectDate(day)}
              className={cn(
                'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-lg text-xs transition-colors',
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
              ) : inMonth && status === 'weekend' ? (
                <span className={cn('text-[9px]', isSelected && 'text-primary-foreground/85')}>—</span>
              ) : null}
              {isToday && (
                <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', isSelected ? 'bg-primary-foreground' : 'bg-primary')} />
              )}
            </button>
          );
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
