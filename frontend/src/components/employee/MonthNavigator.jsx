import dayjs from 'dayjs';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Compact prev / month / next control sized like the other toolbar controls, plus a "This month"
// shortcut whenever another month is showing. Same date math as TimesheetCalendar's header.
const MonthNavigator = ({ month, year, onChange }) => {
  const monthDate = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const now = dayjs();
  const isCurrentMonth = monthDate.isSame(now, 'month');

  const goPrev = () => {
    const prev = monthDate.subtract(1, 'month');
    onChange(prev.month() + 1, prev.year());
  };
  const goNext = () => {
    const next = monthDate.add(1, 'month');
    onChange(next.month() + 1, next.year());
  };

  const stepClass = 'flex h-full w-[clamp(1.625rem,1.8vw,2rem)] items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex h-[clamp(1.875rem,2vw,2.25rem)] items-center gap-0.5 rounded-md border bg-card p-0.5">
        <button type="button" onClick={goPrev} aria-label="Previous month" className={stepClass}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span
          className="flex min-w-[8.5rem] items-center justify-center gap-1.5 px-1.5 text-[clamp(0.75rem,0.85vw,0.875rem)] font-semibold tabular-nums"
          aria-live="polite"
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {monthDate.format('MMMM YYYY')}
        </span>
        <button type="button" onClick={goNext} aria-label="Next month" className={stepClass}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {!isCurrentMonth && (
        <Button variant="outline" size="toolbar" onClick={() => onChange(now.month() + 1, now.year())}>
          This month
        </Button>
      )}
    </div>
  );
};

export default MonthNavigator;
