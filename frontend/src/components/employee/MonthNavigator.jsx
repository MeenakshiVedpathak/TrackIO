import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Same prev/next-month header pattern as TimesheetCalendar's calendar header, extracted as a
// standalone control so pages other than My Work Log can step through months without
// duplicating the date math.
const MonthNavigator = ({ month, year, onChange }) => {
  const monthDate = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);

  const goPrev = () => {
    const prev = monthDate.subtract(1, 'month');
    onChange(prev.month() + 1, prev.year());
  };
  const goNext = () => {
    const next = monthDate.add(1, 'month');
    onChange(next.month() + 1, next.year());
  };

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
      <Button variant="outline" size="icon-sm" onClick={goPrev} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-sm font-semibold">{monthDate.format('MMMM YYYY')}</h2>
      <Button variant="outline" size="icon-sm" onClick={goNext} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default MonthNavigator;
