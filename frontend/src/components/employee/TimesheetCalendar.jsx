import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  ChevronLeft, ChevronRight, ChevronDown, CalendarOff, Trash2, Clock3, ShieldCheck, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';
import { formatHourMinuteValue, formatHoursMinutes } from '@/utils/formatters';
import { isOffDay } from '@/utils/weekOffPolicy';
import {
  APPROVAL_META, APPROVAL_ORDER, approvalStateOf, describeCounts, summarizeDay,
} from '@/utils/workLogDayStatus';
import { EXPECTED_DAILY_HOURS } from './WorkLogEntryModal';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Swatches mirror the day cells themselves, so the legend reads as "a cell that looks like this".
const HOURS_LEGEND = [
  { key: 'completed', swatch: 'bg-emerald-100 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-950 dark:ring-emerald-800', label: `${EXPECTED_DAILY_HOURS}h done`, description: 'Full working hours logged' },
  { key: 'partial', swatch: 'bg-amber-100 ring-1 ring-inset ring-amber-300 dark:bg-amber-950 dark:ring-amber-800', label: `Under ${EXPECTED_DAILY_HOURS}h`, description: `Some hours logged, less than ${EXPECTED_DAILY_HOURS}` },
  { key: 'none', swatch: 'bg-muted ring-1 ring-inset ring-rose-300 dark:ring-rose-800', label: 'No entry', description: 'No hours logged for this workday' },
  { key: 'weekend', swatch: 'bg-muted-foreground/15', label: 'Day off', description: 'Weekly off or holiday' },
  { key: 'today', swatch: 'bg-background ring-2 ring-inset ring-primary', label: 'Today', description: 'Current date' },
];

const APPROVAL_DESCRIPTIONS = {
  rejected: 'Sent back by your approver — fix and resubmit',
  reverted: 'Approval withdrawn — back to pending',
  partiallyReverted: 'Some approved entries were sent back to pending',
  pending: 'Waiting for your approver',
  approved: 'Approved by your approver',
  deleted: 'An entry for this day was removed',
};

// A day's colour is purely a client-side read of `totalHours` against a standard 8-hour
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

// Only "done" and "under 8h" get a tint; an empty past workday stays neutral (just a muted red
// "0h") so a month of gaps doesn't turn the whole grid red.
const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
  partial: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  none: 'bg-muted/40 text-foreground/80 ring-1 ring-inset ring-border/60',
  weekend: 'bg-muted/30 text-muted-foreground/60',
  futureWeekend: 'bg-muted/20 text-muted-foreground/35',
  future: 'text-muted-foreground/30',
};

const HOURS_TEXT = { completed: 'text-emerald-700 dark:text-emerald-300', partial: 'text-amber-700 dark:text-amber-300', none: 'text-rose-500' };
const PROGRESS_FILL = { completed: 'bg-emerald-500', partial: 'bg-amber-500', none: 'bg-rose-400' };

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

// Outline icon in the state's colour — light enough to sit beside the date without crowding it.
const ApprovalIcon = ({ state, className }) => {
  const meta = APPROVAL_META[state];
  if (!meta) return null;
  const Icon = meta.icon;
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.text, className)} strokeWidth={2.5} aria-hidden="true" />;
};

const LegendSection = ({ icon: Icon, title, hint, children }) => (
  <div>
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3 w-3" aria-hidden="true" />
      </span>
      {title}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </p>
    {children}
  </div>
);

const LegendChip = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-[11px] text-foreground/80">
    {children}
  </span>
);

// Compact chips under the grid, plus a "What do these mean?" popover with one line per item.
const CalendarLegend = () => (
  <div className="mt-4 space-y-3 border-t pt-3">
    <LegendSection icon={Clock3} title="Hours">
      <div className="flex flex-wrap gap-1.5">
        {HOURS_LEGEND.map((item) => (
          <LegendChip key={item.key}>
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', item.swatch)} aria-hidden="true" />
            {item.label}
          </LegendChip>
        ))}
      </div>
    </LegendSection>

    <LegendSection icon={ShieldCheck} title="Approval">
      <div className="flex flex-wrap gap-1.5">
        {APPROVAL_ORDER.map((state) => (
          <LegendChip key={state}>
            <ApprovalIcon state={state} className="h-3 w-3" />
            {APPROVAL_META[state].label}
          </LegendChip>
        ))}
      </div>
    </LegendSection>

    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3 w-3" aria-hidden="true" />
          What do these mean?
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-4">
        <LegendSection icon={Clock3} title="Hours" hint="(work time)">
          <ul className="space-y-2">
            {HOURS_LEGEND.map((item) => (
              <li key={item.key} className="flex items-start gap-2.5">
                <span className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-md', item.swatch)} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </LegendSection>
        <div className="border-t" />
        <LegendSection icon={ShieldCheck} title="Approval" hint="(entry status)">
          <ul className="space-y-2">
            {APPROVAL_ORDER.map((state) => (
              <li key={state} className="flex items-start gap-2.5">
                <ApprovalIcon state={state} className="mt-0.5 h-4 w-4" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">{APPROVAL_META[state].label}</span>
                  <span className="block text-[11px] text-muted-foreground">{APPROVAL_DESCRIPTIONS[state]}</span>
                </span>
              </li>
            ))}
          </ul>
        </LegendSection>
      </PopoverContent>
    </Popover>
  </div>
);

// Month grid with per-day logged hours (GET /employee-timesheets/calendar ->
// [{ date, totalHours, hasEntries, futureDisabled, statusCounts? }]) plus an approval badge per
// day. `countsByDate` is the per-day approval tally derived from the month's entries list; the
// calendar endpoint's own `statusCounts` wins whenever it sends one (see summarizeDay).
// A date is disabled if either the client's own "after today" check or the backend's
// `futureDisabled` flag says so — belt-and-suspenders, since the real enforcement is
// server-side on the entries endpoints regardless.
const TimesheetCalendar = ({
  month, year, onMonthChange, calendarByDate, countsByDate, selectedDate, onSelectDate, isLoading, saturdayOffRule = 'ALL',
}) => {
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
  // work log entry form. Starts collapsed on mobile — a date is always already selected (defaults
  // to today). Tapping the summary re-expands it; picking a new day re-collapses it.
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);

  const handleSelectDate = (day) => {
    onSelectDate(day);
    if (isMobile) setCollapsed(true);
  };

  const describeDay = (day) => {
    const dateKey = day.format('YYYY-MM-DD');
    const dayInfo = calendarByDate?.[dateKey];
    const isFuture = day.isAfter(today, 'day') || !!dayInfo?.futureDisabled;
    const isWeekend = isOffDay(day, saturdayOffRule);
    const status = dayStatus({ dayInfo, isWeekend, isFuture });
    const counts = summarizeDay(dayInfo, countsByDate?.[dateKey]);
    const approval = isFuture ? null : approvalStateOf(counts);
    const hours = Number(dayInfo?.totalHours ?? 0);
    return { dateKey, dayInfo, isFuture, status, counts, approval, hours };
  };

  if (isMobile && collapsed) {
    const { status, approval, hours } = describeDay(selectedDate);
    const isWeekendStatus = status === 'weekend' || status === 'futureWeekend';

    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', PROGRESS_FILL[status] ?? 'bg-muted-foreground/30')} />
          <span className="min-w-0 truncate text-sm font-semibold">{selectedDate.format('ddd, DD MMM YYYY')}</span>
          <ApprovalIcon state={approval} />
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {isWeekendStatus ? 'Day Off' : `${formatHourMinuteValue(hours)} logged`}
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
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
          const inMonth = day.month() === monthDate.month();
          const { dateKey, isFuture, status, counts, approval, hours } = describeDay(day);
          const isToday = day.isSame(today, 'day');
          const isSelected = selectedDate && day.isSame(selectedDate, 'day');
          const isWeekendStatus = status === 'weekend' || status === 'futureWeekend';
          const isWorkStatus = status === 'completed' || status === 'partial' || status === 'none';
          const showDeletedMark = inMonth && !isFuture && counts.deleted > 0 && approval !== 'deleted';
          const progress = Math.min(1, hours / EXPECTED_DAILY_HOURS);

          const summaryText = isWeekendStatus
            ? 'Week off'
            : [
              `${formatHoursMinutes(hours)} of ${EXPECTED_DAILY_HOURS}h`,
              approval && APPROVAL_META[approval].label,
              describeCounts(counts),
            ].filter(Boolean).join(' · ');

          const dayButton = (
            <button
              key={dateKey}
              type="button"
              disabled={isFuture || !inMonth}
              onClick={() => handleSelectDate(day)}
              aria-label={inMonth ? `${day.format('dddd, D MMMM')}: ${summaryText}` : undefined}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'relative flex min-h-[58px] w-full flex-col rounded-lg p-1.5 text-xs transition-all duration-150',
                !inMonth ? 'cursor-default text-muted-foreground/25' : STATUS_STYLES[status],
                inMonth && !isFuture && !isSelected && 'cursor-pointer hover:shadow-md hover:ring-primary/40',
                isFuture && inMonth && 'cursor-not-allowed',
                isToday && !isSelected && 'ring-2 ring-inset ring-primary',
                isSelected && 'bg-primary text-primary-foreground shadow-md ring-0'
              )}
            >
              {/* Top line: date on the left, approval / deleted marks on the right — side by
                  side, so nothing ever sits on top of the date. */}
              <span className="flex items-center justify-between gap-0.5">
                <span className="text-[13px] font-semibold leading-none">{day.date()}</span>
                {inMonth && !isLoading && (approval || showDeletedMark) && (
                  <span className="flex items-center gap-0.5">
                    {showDeletedMark && (
                      <Trash2 className={cn('h-3 w-3', isSelected ? 'text-primary-foreground/80' : 'text-slate-400')} aria-hidden="true" />
                    )}
                    <ApprovalIcon state={approval} className={cn(isSelected && 'text-primary-foreground')} />
                  </span>
                )}
              </span>

              <span className="mt-auto flex flex-col items-center gap-1">
                {isLoading ? (
                  <Skeleton className="h-2.5 w-8" />
                ) : inMonth && isWorkStatus ? (
                  <span className={cn('text-[11px] font-semibold tabular-nums leading-none', isSelected ? 'text-primary-foreground' : HOURS_TEXT[status])}>
                    {formatHourMinuteValue(hours)}h
                  </span>
                ) : inMonth && isWeekendStatus ? (
                  <CalendarOff className={cn('h-3.5 w-3.5', isSelected ? 'text-primary-foreground/85' : 'text-muted-foreground/50')} />
                ) : null}

                {/* Progress only while a workday is part-filled; done / empty days say it by colour. */}
                {inMonth && status === 'partial' && !isLoading && (
                  <span
                    className={cn('h-1 w-full overflow-hidden rounded-full', isSelected ? 'bg-primary-foreground/25' : 'bg-amber-200/70 dark:bg-amber-900/60')}
                    aria-hidden="true"
                  >
                    <span
                      className={cn('block h-full rounded-full transition-[width] duration-300', isSelected ? 'bg-primary-foreground' : 'bg-amber-500')}
                      style={{ width: `${progress * 100}%` }}
                    />
                  </span>
                )}
              </span>
            </button>
          );

          if (!inMonth || (isFuture && !isWeekendStatus)) return dayButton;

          return (
            <Tooltip key={dateKey}>
              <TooltipTrigger asChild>{dayButton}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p className="font-semibold">{day.format('ddd, D MMM')}</p>
                <p className="text-muted-foreground">{summaryText}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <CalendarLegend />
    </div>
  );
};

export default TimesheetCalendar;
